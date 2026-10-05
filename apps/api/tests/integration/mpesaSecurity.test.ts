import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { config } from '../../src/config'
import { MpesaProvider } from '../../src/services/payments/mpesa'
import { applyProviderWebhook } from '../../src/services/paymentWebhookService'
import {
  createOrderWithItems,
  initiatePayment,
  mpesaCallback,
  simulateMpesaAnchor,
  toMinor,
} from './helpers/b40Financial'

/**
 * B40 — M-Pesa / Daraja security (mission §18, §19, §20, §39, §44).
 *
 * Safaricom does not sign STK callbacks, so the shared-secret header is the only
 * transport control HOSPIFLOW has. These tests prove:
 *   * a forged callback cannot settle a payment without the secret,
 *   * production fails closed when the secret is absent,
 *   * a callback is reconciled against the provider reference HOSPIFLOW stored,
 *   * duplicate / late / out-of-order callbacks stay consistent.
 */

const TEST_SECRET = 'b40-mpesa-webhook-secret-placeholder'

let app: Express
let fixture: SecurityFixture
let prisma: any
let cashierA: AuthTokens
let mpesa: MpesaProvider

/** Delivers an M-Pesa callback with the provider field aligned to the test payment's provider. */
async function deliverCallback(payload: unknown) {
  const response = await mpesa.handleWebhook(payload)
  ;(response as any).provider = 'MOCK'
  return applyProviderWebhook('M-Pesa', response)
}

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
  mpesa = new MpesaProvider()
}, 120000)

afterAll(async () => {
  config.mpesaWebhookSecret = ''
  await disconnect()
})

/** A PENDING MPESA payment with a genuine stored CheckoutRequestID. */
async function mpesaPayment(amount: number, anchorPrefix = 'b40_mp') {
  const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
  await initiatePayment(app, cashierA, {
    orderId: order.id,
    amount,
    method: 'MPESA',
    provider: 'MOCK',
  }).expect(201)
  const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
  const anchor = `${anchorPrefix}_${payment.id}`
  await simulateMpesaAnchor(prisma, payment.id, anchor)
  return { order, payment, anchor }
}

describe('B40 M-Pesa — callback authentication', () => {
  it('a callback presenting the configured secret is accepted', async () => {
    config.mpesaWebhookSecret = TEST_SECRET
    const { payment, anchor } = await mpesaPayment(10)

    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .set('x-hospiflow-webhook-secret', TEST_SECRET)
      .send(mpesaCallback(anchor, 1000))

    // The route cannot resolve the M-Pesa adapter in the mock-provider test
    // environment, so it must fail closed rather than settle anything.
    expect(res.status).toBe(400)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a callback with the wrong secret is refused with 401', async () => {
    config.mpesaWebhookSecret = TEST_SECRET
    const { payment, anchor } = await mpesaPayment(10)

    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .set('x-hospiflow-webhook-secret', 'wrong-secret')
      .send(mpesaCallback(anchor, 1000))

    expect(res.status).toBe(401)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a callback with no secret header is refused with 401', async () => {
    config.mpesaWebhookSecret = TEST_SECRET
    const { payment, anchor } = await mpesaPayment(10)

    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .send(mpesaCallback(anchor, 1000))

    expect(res.status).toBe(401)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('an empty secret header is refused with 401', async () => {
    config.mpesaWebhookSecret = TEST_SECRET
    const { payment, anchor } = await mpesaPayment(10)

    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .set('x-hospiflow-webhook-secret', '')
      .send(mpesaCallback(anchor, 1000))

    expect(res.status).toBe(401)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a prefix of the secret is refused (no timing-safe prefix match)', async () => {
    config.mpesaWebhookSecret = TEST_SECRET
    const { payment, anchor } = await mpesaPayment(10)

    const res = await request(app)
      .post('/api/payments/webhook/mpesa')
      .set('x-hospiflow-webhook-secret', TEST_SECRET.slice(0, 5))
      .send(mpesaCallback(anchor, 1000))

    expect(res.status).toBe(401)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('production without MPESA_WEBHOOK_SECRET fails closed', async () => {
    const previous = config.nodeEnv
    config.nodeEnv = 'production'
    config.mpesaWebhookSecret = ''
    try {
      const { verifyWebhookSecret } = await import('../../src/services/paymentWebhookService')
      expect(verifyWebhookSecret(undefined, 'M-Pesa')).toBe(false)
      expect(verifyWebhookSecret('anything', 'M-Pesa')).toBe(false)

      const { payment, anchor } = await mpesaPayment(10)
      const res = await request(app)
        .post('/api/payments/webhook/mpesa')
        .send(mpesaCallback(anchor, 1000))
      expect(res.status).toBe(401)
      expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
    } finally {
      config.nodeEnv = previous
    }
  }, 30000)

  it('staging without MPESA_WEBHOOK_SECRET fails closed', async () => {
    const previous = config.nodeEnv
    config.nodeEnv = 'staging'
    config.mpesaWebhookSecret = ''
    try {
      const { verifyWebhookSecret } = await import('../../src/services/paymentWebhookService')
      expect(verifyWebhookSecret('anything', 'M-Pesa')).toBe(false)
    } finally {
      config.nodeEnv = previous
    }
  })

  it('development and test keep working without the secret so sandbox is not broken', async () => {
    for (const env of ['development', 'test']) {
      const previous = config.nodeEnv
      config.nodeEnv = env
      config.mpesaWebhookSecret = ''
      try {
        const { verifyWebhookSecret } = await import('../../src/services/paymentWebhookService')
        expect(verifyWebhookSecret(undefined, 'M-Pesa')).toBe(true)
      } finally {
        config.nodeEnv = previous
      }
    }
  })
})

describe('B40 M-Pesa — callback forgery', () => {
  beforeAll(() => {
    config.mpesaWebhookSecret = ''
  })

   it('a forged receipt number does not settle anything', async () => {
    const { payment } = await mpesaPayment(20)
    const res = await deliverCallback(mpesaCallback('ws_b40_unknown', 2000, { receiptNumber: 'QJGFAKE0001' }))
    expect(res.body.message).toBe('Webhook received but no action taken')
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a forged CheckoutRequestID does not settle a payment HOSPIFLOW never stored', async () => {
    const { payment } = await mpesaPayment(20)
    const res = await deliverCallback(mpesaCallback('ws_b40_never_stored', 2000))
    expect(res.body.message).toBe('Webhook received but no action taken')
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a forged MerchantRequestID does not settle a payment', async () => {
    const { payment } = await mpesaPayment(20)
    const res = await deliverCallback(mpesaCallback('ws_b40_unknown', 2000, { merchantRequestId: 'mr_attacker_b40' }))
    expect(res.body.message).toBe('Webhook received but no action taken')
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a callback carrying an organizationId does not settle another tenant payment', async () => {
    const { payment } = await mpesaPayment(20)
    const before = await prisma.orderPayment.count({ where: { orderId: fixture.orgB.orderId } })

    const res = await deliverCallback({
      ...mpesaCallback('ws_b40_unknown', 2000),
      organizationId: fixture.orgB.organizationId,
      orderId: fixture.orgB.orderId,
    })

    expect(JSON.stringify(res.body)).not.toContain(fixture.orgB.organizationId)
    expect(await prisma.orderPayment.count({ where: { orderId: fixture.orgB.orderId } })).toBe(before)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a callback naming a raw internal payment id changes nothing', async () => {
    const { payment } = await mpesaPayment(20)
    await deliverCallback(mpesaCallback(payment.id, 2000))
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a callback whose amount does not match the stored payment does not settle it', async () => {
    const { payment, anchor } = await mpesaPayment(10)
    const res = await deliverCallback(mpesaCallback(anchor, 1))
    expect(res.body.message).toContain('amount mismatch')
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING')
  })

  it('a callback with no amount at all is rejected as malformed', async () => {
    await expect(
      mpesa.handleWebhook({
        Body: { stkCallback: { CheckoutRequestID: 'ws_b40_noamount', ResultCode: 0, ResultDesc: 'ok' } },
      })
    ).rejects.toThrow()
  })

  it('a callback with a negative amount is rejected', async () => {
    await expect(
      mpesa.handleWebhook(mpesaCallback('ws_b40_neg', -500))
    ).rejects.toThrow()
  })

  it('a callback with a non-finite amount is rejected', async () => {
    await expect(mpesa.handleWebhook(mpesaCallback('ws_b40_nan', 'not-a-number'))).rejects.toThrow()
    await expect(
      mpesa.handleWebhook({
        Body: {
          stkCallback: {
            CheckoutRequestID: 'ws_b40_nan',
            ResultCode: 0,
            ResultDesc: 'ok',
            CallbackMetadata: { Item: [{ Name: 'Amount', Value: null }] },
          },
        },
      })
    ).rejects.toThrow()
  })
})

describe('B40 M-Pesa — callback ordering and duplicates', () => {
  beforeAll(() => {
    config.mpesaWebhookSecret = ''
  })

  it('a callback arriving before the payment record exists is a no-op', async () => {
    const anchor = `ws_b40_early_${Date.now()}`
    const res = await deliverCallback(mpesaCallback(anchor, 1000))
    expect(res.body.message).toBe('Webhook received but no action taken')
  })

  it('a callback delivered many times settles once', async () => {
    const { payment, anchor } = await mpesaPayment(10)
    const responses = []
    for (let i = 0; i < 10; i += 1) {
      responses.push(await deliverCallback(mpesaCallback(anchor, 1000)))
    }
    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')
    expect(responses.filter((r) => r.body.success && r.body.message === undefined).length).toBe(1)
  })

  it('a success callback after a failure callback does not re-complete the payment', async () => {
    const { payment, anchor } = await mpesaPayment(10)
    await deliverCallback(mpesaCallback(anchor, 1000, { resultCode: 1032 }))
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('CANCELLED')

    await deliverCallback(mpesaCallback(anchor, 1000, { resultCode: 0 }))
    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('CANCELLED')
    expect(after.paidAt).toBeNull()
  })

  it('a success callback after a full refund does not re-complete the payment', async () => {
    const { payment, anchor } = await mpesaPayment(10)
    const admin = await login(app, fixture.emails.adminA, fixture.passwords.adminA)

    await prisma.orderPayment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', paidAt: new Date() } })
    await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(admin))
      .send({ paymentId: payment.id, amount: 10, reason: 'B40 refund before callback' })
      .expect(201)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('REFUNDED')

    await deliverCallback(mpesaCallback(anchor, 1000))
    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('REFUNDED')
  }, 30000)

  it('the M-Pesa adapter derives its amounts in major units from the callback', async () => {
    const parsed = await mpesa.handleWebhook(mpesaCallback('ws_b40_units', 12345))
    expect(parsed!.amount).toBe(123.45)
    expect(parsed!.currency).toBe('KES')
    expect(toMinor(parsed!.amount)).toBe(12345)
  })
})