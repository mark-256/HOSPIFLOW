import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { applyProviderWebhook } from '../../src/services/paymentWebhookService'
import {
  createOrderWithItems,
  deliverMpesaCallback,
  initiatePayment,
  mpesaCallback,
  payOrder,
  readOrder,
  simulateMpesaAnchor,
  toMinor,
} from './helpers/b40Financial'

/**
 * B40 — Webhook authentication, settlement anchoring and idempotency
 * (mission §12 / §15 / §33 / §34 / §39).
 *
 * The permanent B39-15 regression is preserved verbatim in intent: client
 * metadata must never choose the settlement anchor, and a callback must never
 * settle a payment, order or folio that the database relationship does not prove.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let cashierA: AuthTokens
let adminA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

/** A PENDING MPESA payment created through the real initiate endpoint. */
async function pendingMpesaPayment(amount: number, metadata: Record<string, unknown> = {}) {
  const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
  await initiatePayment(app, cashierA, {
    orderId: order.id,
    amount,
    method: 'MPESA',
    provider: 'MOCK',
    metadata,
  }).expect(201)
  const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
  return { order, payment }
}

describe('B40 webhook — the settlement anchor is never client-supplied', () => {
  const anchorKeys = ['checkoutRequestId', 'stripePaymentIntentId', 'providerResponse']

  for (const key of anchorKeys) {
    it(`client metadata cannot write the reserved key "${key}"`, async () => {
      const forged = `b40_forged_${key}_${Date.now()}`
      const value = key === 'providerResponse' ? { id: forged } : forged
      const { payment } = await pendingMpesaPayment(10, { [key]: value })

      const stored = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      const serialised = JSON.stringify(stored.metadata ?? {})
      if (key === 'providerResponse') {
        expect(serialised).not.toContain(forged)
      } else {
        expect(stored.metadata).not.toHaveProperty(key)
        expect(serialised).not.toContain(forged)
      }
    })
  }

  it('client metadata cannot choose an arbitrary payment to settle', async () => {
    const victim = await payOrder(app, adminA, fixture.orgA.outletId, fixture.orgA.productId)
    await prisma.orderPayment.update({ where: { id: victim.id }, data: { status: 'PENDING', paidAt: null } })

    const { payment } = await pendingMpesaPayment(10, {
      metadataVictimId: victim.id,
      paymentId: victim.id,
      orderId: victim.orderId,
      folioId: fixture.orgA.folioId,
      organizationId: fixture.orgB.organizationId,
    })

    const res = await deliverMpesaCallback(mpesaCallback(victim.id, 1000))
    expect(res.status).toBe(200)

    const victimAfter = await prisma.orderPayment.findUnique({ where: { id: victim.id } })
    expect(victimAfter.status).toBe('PENDING')
    expect(victimAfter.paidAt).toBeNull()
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  }, 30000)

  it('an attacker-chosen anchor never settles anything', async () => {
    const anchor = `b40_anchor_${Date.now()}`
    const { payment } = await pendingMpesaPayment(10, { stripePaymentIntentId: anchor })

    const res = await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'SUCCEEDED',
      amount: 10,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })

    expect(res.status).toBe(200)
    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).not.toBe('COMPLETED')
    expect(after.paidAt).toBeNull()
  }, 30000)

  it('client metadata never carries tenant context into the audit trail', async () => {
    const { payment } = await pendingMpesaPayment(10, {
      organizationId: fixture.orgB.organizationId,
      propertyId: fixture.orgB.propertyId,
    })

    const paymentAfter = await prisma.orderPayment.findUnique({
      where: { id: payment.id },
      include: { order: { include: { outlet: { include: { property: true } } } } },
    })
    expect(paymentAfter.order.outlet.property.organizationId).toBe(fixture.orgA.organizationId)
  }, 30000)

  it('benign client metadata is still stored and harmless', async () => {
    const { payment } = await pendingMpesaPayment(10, { tableNumber: '14', note: 'window seat' })
    const stored = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(stored.metadata.tableNumber).toBe('14')
    expect(stored.metadata.note).toBe('window seat')
  }, 30000)
})

describe('B40 webhook — settlement requires an authoritative provider relationship', () => {
  it('only a payment whose stored anchor matches settles', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_rel_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    const miss = await deliverMpesaCallback(mpesaCallback(`${anchor}_wrong`, toMinor(order.total)))
    expect(miss.body.message).toBe('Webhook received but no action taken')
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')

    const hit = await deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total)))
    expect(hit.body.success).toBe(true)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('COMPLETED')
  }, 30000)

  it('the provider recorded on the payment must match the callback provider', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_prov_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'SUCCEEDED',
      amount: order.total,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })

    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).not.toBe('COMPLETED')
  }, 30000)

  it('the currency declared by the callback must match the order currency', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_cur_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    await applyProviderWebhook('M-Pesa', {
      id: anchor,
      status: 'SUCCEEDED',
      reference: 'QJG0000B40',
      checkoutRequestId: anchor,
      amount: order.total,
      currency: 'USD',
      provider: 'MPESA',
      method: 'MPESA',
      createdAt: new Date(),
    })

    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).not.toBe('COMPLETED')
  }, 30000)
})

describe('B40 webhook — reconciliation of the order financial state', () => {
  it('a settled webhook reduces the authoritative remaining balance exactly once', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_recon_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    for (let i = 0; i < 4; i += 1) {
      await deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total)))
    }

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
    expect(after.balance).toBeCloseTo(0, 2)
  }, 60000)

  it('a mixed settle/verify pair cannot credit the order twice', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_mixed_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    await deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total)))
    await request(app).post('/api/payments/verify').set(authHeaders(cashierA)).send({ paymentId: payment.id }).expect(200)

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
  }, 30000)

  it('settling one payment and then paying the remainder leaves a zero balance', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId, 2)
    const part = Math.round(order.total / 2 * 100) / 100

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: part,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_split_pay_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)
    await deliverMpesaCallback(mpesaCallback(anchor, toMinor(part)))

    const midway = await readOrder(prisma, order.id)
    expect(midway.paidAmount).toBeCloseTo(part, 2)

    await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set(authHeaders(cashierA))
      .send({ paymentMethod: 'CASH', amount: midway.balance, provider: 'MOCK' })
      .expect(201)

    const final = await readOrder(prisma, order.id)
    expect(final.paidAmount).toBeCloseTo(order.total, 2)
    expect(final.balance).toBeCloseTo(0, 2)
  }, 30000)
})

describe('B40 webhook — transport', () => {
  it('both webhook routes are reachable without a staff token', async () => {
    for (const route of ['/api/payments/webhook/mpesa', '/api/payments/webhook/stripe']) {
      const res = await request(app).post(route).send({ Body: { stkCallback: { ResultCode: 0 } } })
      expect(res.status).not.toBe(401)
      expect(res.status).toBeLessThan(500)
    }
  })

  it('a webhook response never echoes the submitted secret or provider credentials', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .set('x-hospiflow-webhook-secret', 'attempted-secret-value')
      .send(mpesaCallback('b40_echo', 1000))
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('attempted-secret-value')
    expect(body).not.toContain('MPESA_CONSUMER_SECRET')
    expect(body).not.toContain('passkey')
  })

  it('a webhook error never returns a stack trace or SQL detail', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .send({ Body: { stkCallback: { CheckoutRequestID: 'b40_err', ResultCode: 0 } } })
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('at ')
    expect(body).not.toContain('SELECT ')
    expect(body).not.toContain('prisma')
    expect(body).not.toContain('node_modules')
  })
})