import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { MpesaProvider } from '../../src/services/payments/mpesa'
import { applyProviderWebhook } from '../../src/services/paymentWebhookService'

/**
 * B39 — Payment and webhook security (mission §17, §18).
 *
 * All provider interaction is mocked (PAYMENT_PROVIDER=mock in the test
 * environment) and no real money can move. Webhook tests exercise the real
 * M-Pesa callback route.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let adminA: AuthTokens
let adminB: AuthTokens
let cashierA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

async function payOrder(token: AuthTokens, outletId = fixture.orgA.outletId, productId = fixture.orgA.productId) {
  // Each payment gets its own order: paying an already-settled order is
  // rejected by the order service, so a shared fixture order would make later
  // tests fail for reasons unrelated to payments.
  const order = await request(app)
    .post('/api/orders')
    .send({ outletId, orderType: 'DINE_IN' })
    .set(authHeaders(token))
    .expect(201)

  await request(app)
    .post(`/api/orders/${order.body.data.id}/items`)
    .send({ productId, quantity: 1 })
    .set(authHeaders(token))
    .expect(201)

  // Adding items recalculates the order total, so re-read the order rather than
  // trusting the balance from the create response. The order service refuses to
  // take more than the outstanding balance, so pay exactly what is owed.
  const balance = Number((await prisma.order.findUnique({ where: { id: order.body.data.id } })).balance)
  const res = await request(app)
    .post(`/api/orders/${order.body.data.id}/pay`)
    .send({ paymentMethod: 'CASH', amount: balance, provider: 'MOCK' })
    .set(authHeaders(token))
    .expect(201)
  return res.body.data
}

describe('B39 Payments — tenant scoping', () => {
  let paymentA: any
  let paymentB: any

  beforeAll(async () => {
    paymentA = await payOrder(cashierA)
    paymentB = await payOrder(adminB, fixture.orgB.outletId, fixture.orgB.productId)
  }, 60000)

  it('a payment of another tenant cannot be read', async () => {
    const res = await request(app).get(`/api/payments/${paymentB.id}`).set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
  })

  it('a payment of another tenant cannot be verified', async () => {
    const res = await request(app).post('/api/payments/verify').send({ paymentId: paymentB.id }).set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
  })

  it('a payment of another tenant cannot be refunded', async () => {
    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: paymentB.id, amount: 10, reason: 'attack' })
      .set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
    const payment = await prisma.orderPayment.findUnique({ where: { id: paymentB.id } })
    expect(payment.status).toBe('COMPLETED')
    expect(await prisma.refund.count({ where: { paymentId: paymentB.id } })).toBe(0)
  })

  it('payment initiation against another tenant order is refused', async () => {
    const res = await request(app)
      .post('/api/payments/initiate')
      .send({ orderId: fixture.orgB.orderId, amount: 10, method: 'MPESA', provider: 'MOCK' })
      .set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
  })

  it('the payment list is tenant scoped', async () => {
    const res = await request(app).get('/api/payments').set(authHeaders(adminA)).expect(200)
    const ids = res.body.data.map((p: any) => p.id)
    expect(ids).toContain(paymentA.id)
    expect(ids).not.toContain(paymentB.id)
  })

  it('a client supplied organizationId cannot widen the payment list', async () => {
    const res = await request(app)
      .get('/api/payments')
      .query({ organizationId: fixture.orgB.organizationId })
      .set(authHeaders(adminA))
      .expect(200)
    expect(res.body.data.map((p: any) => p.id)).not.toContain(paymentB.id)
  })
})

describe('B39 Payments — refund authorization and integrity', () => {
  it('a refund requires the payments_refund permission', async () => {
    const payment = await payOrder(cashierA)
    const chef = await login(app, fixture.emails.chefA, fixture.passwords.chefA)
    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: payment.id, amount: 1 })
      .set(authHeaders(chef))
      .expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('a refund cannot exceed the remaining refundable amount', async () => {
    const payment = await payOrder(cashierA)
    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: payment.id, amount: Number(payment.amount) + 1000 })
      .set(authHeaders(adminA))
    expect(res.status).toBe(400)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  })

  it('a second full refund cannot be made after the payment is fully refunded', async () => {
    const payment = await payOrder(cashierA)
    await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: payment.id, amount: Number(payment.amount), reason: 'B39 full' })
      .set(authHeaders(adminA))
      .expect(201)

    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: payment.id, amount: 1, reason: 'B39 second' })
      .set(authHeaders(adminA))
    expect([400, 404]).toContain(res.status)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1)
  })

  it('a negative refund amount is rejected', async () => {
    const payment = await payOrder(cashierA)
    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: payment.id, amount: -10 })
      .set(authHeaders(adminA))
      .expect(400)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  })

  it('a refund of a non-completed payment is rejected', async () => {
    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: fixture.orgA.orderId, amount: 1 })
      .set(authHeaders(adminA))
    expect([400, 404]).toContain(res.status)
  })

  it('refunds are recorded against the correct tenant', async () => {
    const payment = await payOrder(cashierA)
    const partial = Math.round(Number(payment.amount) / 2 * 100) / 100
    const res = await request(app)
      .post('/api/payments/refund')
      .send({ paymentId: payment.id, amount: partial, reason: 'B39 partial' })
      .set(authHeaders(adminA))
    expect(res.status).toBe(201)

    const refund = await prisma.refund.findUnique({ where: { id: res.body.data.id } })
    expect(refund.paymentId).toBe(payment.id)
    expect(refund.approvedBy).toBe(fixture.users.adminA)

    const updated = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(updated.status).toBe('PARTIALLY_REFUNDED')
  })
})

describe('B39 Payments — idempotency is preserved', () => {
  it('repeating an order payment with the same idempotency key does not double charge', async () => {
    const order = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    await request(app)
      .post(`/api/orders/${order.body.data.id}/items`)
      .send({ productId: fixture.orgA.productId, quantity: 1 })
      .set(authHeaders(cashierA))
      .expect(201)

    const key = 'b39-idem-key'
    const first = await request(app)
      .post(`/api/orders/${order.body.data.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': key })
      .send({ paymentMethod: 'CASH', amount: 10, provider: 'MOCK' })
      .expect(201)

    const second = await request(app)
      .post(`/api/orders/${order.body.data.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': key })
      .send({ paymentMethod: 'CASH', amount: 10, provider: 'MOCK' })
      .expect(200)

    expect(second.body.meta.deduplicated).toBe(true)
    expect(second.body.data.id).toBe(first.body.data.id)
    expect(await prisma.orderPayment.count({ where: { orderId: order.body.data.id } })).toBe(1)
  })
})

describe('B39 Webhooks — M-Pesa callback authentication', () => {
  it('the M-Pesa webhook is reachable without a staff token (provider callback)', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .send({ Body: { stkCallback: { ResultCode: 0, ResultDesc: 'Accepted' } } })
    expect([200, 400]).toContain(res.status)
  })

  it('the Stripe webhook refuses a callback with no signature', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/stripe')
      .send({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_b39', status: 'succeeded', amount: 100, currency: 'kes' } } })
    expect(res.status).toBe(400)
  })

  it('the Stripe webhook refuses a callback with a wrong signature', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/stripe')
      .set({ 'stripe-signature': 'deadbeef' })
      .send({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_b39', status: 'succeeded', amount: 100, currency: 'kes' } } })
    expect(res.status).toBe(400)
  })
})

describe('B39 Webhooks — callback settlement semantics', () => {
  // The test environment runs PAYMENT_PROVIDER=mock, so the route's provider
  // lookup cannot hand out the M-Pesa adapter. The settlement rules below are
  // therefore driven through the exact production code path the route uses:
  // MpesaProvider.handleWebhook -> applyProviderWebhook.
  const mpesa = new MpesaProvider()

  async function deliver(payload: unknown) {
    return applyProviderWebhook('M-Pesa', await mpesa.handleWebhook(payload))
  }

  function callback(
    checkoutRequestId: string,
    amountMinorUnits: number | string,
    receiptNumber = 'QJG1234ABCD',
    extra: Record<string, unknown> = {}
  ) {
    return {
      Body: {
        stkCallback: {
          CheckoutRequestID: checkoutRequestId,
          MerchantRequestID: 'mr_b39',
          ResultCode: 0,
          ResultDesc: 'Accepted',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: amountMinorUnits },
              { Name: 'PhoneNumber', Value: '254700000111' },
              { Name: 'MpesaReceiptNumber', Value: receiptNumber },
            ],
          },
          ...extra,
        },
      },
    }
  }

  it('the adapter accepts the string amount Safaricom actually sends', async () => {
    const parsed = await mpesa.handleWebhook(callback('ws_b39_string_amount', '100.00'))
    expect(parsed).not.toBeNull()
    expect(parsed!.amount).toBe(1)
    expect(parsed!.reference).toBe('QJG1234ABCD')
  })

  it('a callback with no amount is rejected as malformed', async () => {
    await expect(
      mpesa.handleWebhook({ Body: { stkCallback: { CheckoutRequestID: 'x', ResultCode: 0, ResultDesc: 'ok' } } })
    ).rejects.toThrow()
  })

  it('a callback that is not an STK callback is ignored', async () => {
    const res = await deliver({ Body: { notificationType: 'promotion' } })
    expect(res).toEqual({ status: 200, body: { success: true, message: 'Webhook received but no action taken' } })
  })

  it('a forged callback naming a raw internal payment id changes nothing', async () => {
    const payment = await payOrder(cashierA)
    await prisma.orderPayment.update({ where: { id: payment.id }, data: { status: 'PENDING', paidAt: null } })

    const res = await deliver(callback(payment.id, 60))
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Webhook received but no action taken')

    const unchanged = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(unchanged.status).toBe('PENDING')
    expect(unchanged.paidAt).toBeNull()
  })

  it('a callback can only settle a payment whose provider reference HOSPIFLOW stored', async () => {
    const payment = await prisma.orderPayment.create({
      data: {
        orderId: fixture.orgA.orderId,
        paymentMethod: 'MPESA',
        amount: '75.00',
        status: 'PENDING',
        provider: 'MPESA',
        metadata: { checkoutRequestId: 'ws_b39_checkout_1' },
      },
    })

    const settle = await deliver(callback('ws_b39_checkout_1', 7500, 'QJG1234ABCD'))
    expect(settle.status).toBe(200)
    expect(settle.body.success).toBe(true)

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')
    expect(settled.reference).toBe('QJG1234ABCD')
    expect(settled.paidAt).not.toBeNull()
  })

  it('a replayed callback does not re-apply to a settled payment', async () => {
    const payment = await prisma.orderPayment.create({
      data: {
        orderId: fixture.orgA.orderId,
        paymentMethod: 'MPESA',
        amount: '25.00',
        status: 'PENDING',
        provider: 'MPESA',
        metadata: { checkoutRequestId: 'ws_b39_checkout_replay' },
      },
    })

    await deliver(callback('ws_b39_checkout_replay', 2500))
    const firstPaidAt = (await prisma.orderPayment.findUnique({ where: { id: payment.id } })).paidAt

    const replay = await deliver(callback('ws_b39_checkout_replay', 2500))
    expect(replay.body.message).toBe('Webhook already applied')

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('COMPLETED')
    expect(String(after.paidAt)).toBe(String(firstPaidAt))
  })

  it('a callback with a tampered amount is not allowed to settle the payment', async () => {
    const payment = await prisma.orderPayment.create({
      data: {
        orderId: fixture.orgA.orderId,
        paymentMethod: 'MPESA',
        amount: '500.00',
        status: 'PENDING',
        provider: 'MPESA',
        metadata: { checkoutRequestId: 'ws_b39_checkout_tamper' },
      },
    })

    const res = await deliver(callback('ws_b39_checkout_tamper', 1))
    expect(res.status).toBe(200)
    expect(res.body.message).toContain('amount mismatch')

    const unchanged = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(unchanged.status).toBe('PENDING')
    expect(unchanged.paidAt).toBeNull()
  })

  it('a failed callback settles the payment as FAILED without marking it paid', async () => {
    const payment = await prisma.orderPayment.create({
      data: {
        orderId: fixture.orgA.orderId,
        paymentMethod: 'MPESA',
        amount: '40.00',
        status: 'PENDING',
        provider: 'MPESA',
        metadata: { checkoutRequestId: 'ws_b39_checkout_failed' },
      },
    })

    await deliver({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'ws_b39_checkout_failed',
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user',
          CallbackMetadata: { Item: [{ Name: 'Amount', Value: 4000 }] },
        },
      },
    })

    const failed = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(failed.status).toBe('CANCELLED')
    expect(failed.paidAt).toBeNull()
  })

  it('a callback for an unknown provider reference is a silent no-op', async () => {
    const res = await deliver(callback('ws_unknown_reference', 100, 'QJGUNKNOWN9'))
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Webhook received but no action taken')
  })

  it('a webhook never accepts tenant context from the callback body', async () => {
    const before = await prisma.orderPayment.count({ where: { orderId: fixture.orgB.orderId } })

    const res = await deliver({
      organizationId: fixture.orgB.organizationId,
      orderId: fixture.orgB.orderId,
      ...callback('ws_unknown_reference', 100, 'QJGUNKNOWN8'),
    })
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain(fixture.orgB.organizationId)
    expect(await prisma.orderPayment.count({ where: { orderId: fixture.orgB.orderId } })).toBe(before)
  })

  it('a settled webhook writes a tenant-scoped audit entry', async () => {
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: fixture.orgA.organizationId, entity: 'OrderPayment', action: 'PAYMENT' },
    })
    expect(audits.length).toBeGreaterThan(0)
    expect(audits.every((a: any) => a.organizationId === fixture.orgA.organizationId)).toBe(true)
  })

  it('the route fails closed when the MPESA provider is not the configured provider', async () => {
    const res = await request(app).post('/api/payments/webhook/mpesa').send(callback('ws_b39_checkout_1', 7500, 'QJGCLOSED1'))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('WEBHOOK_ERROR')
  })
})


describe('B39 Payments — no secret material in responses or errors', () => {
  it('the payment payload never contains provider credentials', async () => {
    const res = await request(app).get('/api/payments').set(authHeaders(adminA)).expect(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('sk_live')
    expect(body).not.toContain('Bearer ')
    expect(body).not.toContain('consumer_secret')
  })

  it('an unsupported provider is rejected without leaking configuration', async () => {
    const res = await request(app)
      .post('/api/payments/initiate')
      .send({ orderId: fixture.orgA.orderId, amount: 10, method: 'CARD', provider: 'NOT_A_PROVIDER' })
      .set(authHeaders(adminA))
    expect([400, 500]).toContain(res.status)
    expect(JSON.stringify(res.body)).not.toContain('STRIPE_SECRET_KEY')
  })

  it('payment update and delete remain unimplemented rather than unguarded', async () => {
    await request(app).patch(`/api/payments/${fixture.orgA.orderId}`).set(authHeaders(adminA)).expect(501)
    await request(app).delete(`/api/payments/${fixture.orgA.orderId}`).set(authHeaders(adminA)).expect(501)
  })

  it('the payment endpoints require the payments_process permission', async () => {
    const chef = await login(app, fixture.emails.chefA, fixture.passwords.chefA)
    await request(app).get('/api/payments').set(authHeaders(chef)).expect(403)
    await request(app).post('/api/payments/verify').send({ paymentId: 'x' }).set(authHeaders(chef)).expect(403)
  })
})

describe('B39 Payments — the webhook resolution anchor is never client-supplied', () => {
  // The M-Pesa/STripe webhook resolver trusts exactly three metadata keys plus
  // `reference`: metadata.checkoutRequestId, metadata.providerResponse.id,
  // metadata.stripePaymentIntentId and reference. Those keys are the settlement
  // anchor, so a caller must not be able to write them through the initiate
  // endpoint's free-form `metadata` object.
  const mpesa = new MpesaProvider()

  async function forgedSuccessCallback(checkoutRequestId: string, amountMinorUnits: number) {
    return applyProviderWebhook(
      'M-Pesa',
      await mpesa.handleWebhook({
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutRequestId,
            MerchantRequestID: 'mr_attacker',
            ResultCode: 0,
            ResultDesc: 'Accepted',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: amountMinorUnits },
                { Name: 'PhoneNumber', Value: '254700000111' },
                { Name: 'MpesaReceiptNumber', Value: 'QJGATTACK01' },
              ],
            },
          },
        },
      })
    )
  }

  async function initiateWithMetadata(metadata: Record<string, unknown>) {
    const order = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    await request(app)
      .post(`/api/orders/${order.body.data.id}/items`)
      .send({ productId: fixture.orgA.productId, quantity: 1 })
      .set(authHeaders(cashierA))
      .expect(201)

    const balance = Number((await prisma.order.findUnique({ where: { id: order.body.data.id } })).balance)

    const res = await request(app)
      .post('/api/payments/initiate')
      .send({ orderId: order.body.data.id, amount: balance, method: 'MPESA', provider: 'MOCK', metadata })
      .set(authHeaders(cashierA))
      .expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.body.data.id } })
    return { payment, balance }
  }

  it('initiate does not persist a client-supplied checkoutRequestId', async () => {
    const { payment } = await initiateWithMetadata({ checkoutRequestId: 'attacker_anchor_checkout_1' })

    expect(payment.metadata).not.toHaveProperty('checkoutRequestId')
    expect(String(JSON.stringify(payment.metadata))).not.toContain('attacker_anchor_checkout_1')
  })

  it('initiate does not persist a client-supplied providerResponse id', async () => {
    const { payment } = await initiateWithMetadata({ providerResponse: { id: 'attacker_anchor_response_1' } })

    // providerResponse is always overwritten by the provider response, but the
    // client value must never be the value that survives in the column.
    const stored = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(String(JSON.stringify(stored.metadata?.providerResponse))).not.toContain('attacker_anchor_response_1')
  })

  it('initiate does not persist a client-supplied stripePaymentIntentId', async () => {
    const { payment } = await initiateWithMetadata({ stripePaymentIntentId: 'pi_attacker_anchor_1' })
    expect(String(JSON.stringify(payment.metadata))).not.toContain('pi_attacker_anchor_1')
  })

  it('a forged callback cannot settle a payment whose anchor the client chose', async () => {
    // `metadata.stripePaymentIntentId` is one of the four keys the resolver
    // trusts and it is never rewritten by the initiate flow, so a client value
    // placed there survives verbatim. Without the fix this callback settles the
    // payment with no provider involvement at all.
    const anchor = `pi_attacker_settle_${Date.now()}`
    const { payment, balance } = await initiateWithMetadata({ stripePaymentIntentId: anchor })

    const res = await forgedSuccessCallback(anchor, Math.round(balance * 100))
    expect(res.status).toBe(200)

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).not.toBe('COMPLETED')
    expect(settled.paidAt).toBeNull()
  })

  it('benign client metadata is still stored', async () => {
    const { payment } = await initiateWithMetadata({ tableNumber: '12', guestNote: 'window seat' })
    expect(payment.metadata.tableNumber).toBe('12')
    expect(payment.metadata.guestNote).toBe('window seat')
  })

  it('a client-supplied idempotencyKey is still honoured', async () => {
    const key = `b39-idem-${Date.now()}`
    const order = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    await request(app)
      .post('/api/payments/initiate')
      .send({ orderId: order.body.data.id, amount: 10, method: 'CASH', provider: 'MOCK', idempotencyKey: key })
      .set(authHeaders(cashierA))
      .expect(201)

    const stored = await prisma.orderPayment.findFirst({ where: { orderId: order.body.data.id } })
    expect(stored.metadata.idempotencyKey).toBe(key)
  })
})
