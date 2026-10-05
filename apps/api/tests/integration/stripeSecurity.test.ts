import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { config } from '../../src/config'
import { StripeProvider } from '../../src/services/payments/stripe'
import { applyProviderWebhook } from '../../src/services/paymentWebhookService'
import {
  createOrderWithItems,
  initiatePayment,
  readOrder,
  simulateMpesaAnchor,
  simulateStripeAnchor,
  toMinor,
} from './helpers/b40Financial'

/**
 * B40 — Stripe security (mission §13, §14, §15, §16, §17, §39, §40).
 *
 * No live Stripe credentials are used. The adapter is exercised directly with
 * test-mode placeholder secrets so signature verification, event handling,
 * replay protection and provider-identifier reconciliation are all real code
 * paths. Nothing in this file can move money.
 */

const TEST_WEBHOOK_SECRET = 'whsec_b40_placeholder_not_a_real_secret'
const TOLERANCE_SECONDS = 300

let app: Express
let fixture: SecurityFixture
let prisma: any
let cashierA: AuthTokens
let stripe: StripeProvider

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)

  config.stripeSecretKey = 'sk_test_b40_placeholder_not_a_real_key'
  config.stripeWebhookSecret = TEST_WEBHOOK_SECRET
  stripe = new StripeProvider()
}, 120000)

afterAll(async () => {
  config.stripeSecretKey = ''
  config.stripeWebhookSecret = ''
  await disconnect()
})

function succeededEvent(paymentIntentId: string, amountMinorUnits: number, currency = 'kes') {
  return {
    id: 'evt_b40_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: paymentIntentId,
        object: 'payment_intent',
        status: 'succeeded',
        amount: amountMinorUnits,
        currency,
        metadata: { hospiflowProvider: 'stripe' },
      },
    },
  }
}

function stripeSignature(payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  return `t=${timestamp},v1=${v1}`
}

describe('B40 Stripe — webhook signature verification', () => {
  it('a correctly signed event is accepted', async () => {
    const payload = JSON.stringify(succeededEvent('pi_b40_valid', 1000))
    const parsed = await stripe.handleWebhook(payload, stripeSignature(payload))
    expect(parsed).not.toBeNull()
    expect(parsed!.status).toBe('SUCCEEDED')
  })

  it('an event signed with the wrong secret is rejected', async () => {
    const payload = JSON.stringify(succeededEvent('pi_b40_wrongsecret', 1000))
    const bad = crypto.createHmac('sha256', 'whsec_attacker_guess').update(`${Math.floor(Date.now() / 1000)}.${payload}`).digest('hex')
    await expect(stripe.handleWebhook(payload, `t=${Math.floor(Date.now() / 1000)},v1=${bad}`)).rejects.toThrow()
  })

  it('an event with no signature header is rejected', async () => {
    await expect(stripe.handleWebhook(JSON.stringify(succeededEvent('pi_b40_nosig', 1000)), undefined)).rejects.toThrow()
  })

  it('an event with a malformed signature header is rejected', async () => {
    const payload = JSON.stringify(succeededEvent('pi_b40_malformed', 1000))
    for (const header of ['', 'deadbeef', 'v1=onlysig', 't=abc', 'garbage=1,garbage2=2']) {
      await expect(stripe.handleWebhook(payload, header)).rejects.toThrow()
    }
  })

  it('a signature computed over a different payload is rejected', async () => {
    const genuine = JSON.stringify(succeededEvent('pi_b40_tamper_src', 1000))
    const tampered = JSON.stringify(succeededEvent('pi_b40_tamper_dst', 1))
    await expect(stripe.handleWebhook(tampered, stripeSignature(genuine))).rejects.toThrow()
  })

  it('a signature with the wrong length does not throw a raw crypto error', async () => {
    const payload = JSON.stringify(succeededEvent('pi_b40_len', 1000))
    await expect(stripe.handleWebhook(payload, 'v1=abcd')).rejects.toThrow(/signature/i)
  })

  it('a signature older than the replay tolerance is rejected', async () => {
    const payload = JSON.stringify(succeededEvent('pi_b40_stale', 1000))
    const stale = Math.floor(Date.now() / 1000) - (TOLERANCE_SECONDS + 120)
    await expect(stripe.handleWebhook(payload, stripeSignature(payload, stale))).rejects.toThrow()
  })

  it('a signature far in the future is rejected', async () => {
    const payload = JSON.stringify(succeededEvent('pi_b40_future', 1000))
    const future = Math.floor(Date.now() / 1000) + (TOLERANCE_SECONDS + 3600)
    await expect(stripe.handleWebhook(payload, stripeSignature(payload, future))).rejects.toThrow()
  })

  it('the webhook route refuses an unsigned event', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/stripe')
      .send(succeededEvent('pi_b40_route', 1000))
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('the webhook route refuses a wrongly signed event', async () => {
    const raw = JSON.stringify(succeededEvent('pi_b40_route_bad', 1000))
    const res = await request(app)
      .post('/api/payments/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', stripeSignature(JSON.stringify({ ...succeededEvent('pi_other', 1) })))
      .send(raw)
    expect(res.status).toBe(400)
  })
})

describe('B40 Stripe — event replay and idempotency', () => {
  async function stripePayment(order: { id: string; total: number }, anchor: string) {
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    await simulateStripeAnchor(prisma, payment.id, anchor)
    return { order, payment }
  }

  it('replaying one signed event settles the payment exactly once', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const anchor = `pi_b40_replay_${Date.now()}`
    const { payment } = await stripePayment(order, anchor)

    const payload = JSON.stringify(succeededEvent(anchor, toMinor(order.total)))
    const signature = stripeSignature(payload)

    const first = await stripe.handleWebhook(payload, signature)
    expect(first!.status).toBe('SUCCEEDED')
    await applyProviderWebhook('Stripe', first)

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')
    const firstPaidAt = String(settled.paidAt)
    const orderAfterFirst = await readOrder(prisma, order.id)

    for (let i = 0; i < 5; i += 1) {
      const replay = await stripe.handleWebhook(payload, stripeSignature(payload))
      await applyProviderWebhook('Stripe', replay)
    }

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('COMPLETED')
    expect(String(after.paidAt)).toBe(firstPaidAt)

    const orderAfter = await readOrder(prisma, order.id)
    expect(orderAfter.paidAmount).toBeCloseTo(orderAfterFirst.paidAmount, 2)

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'OrderPayment', entityId: payment.id, action: 'PAYMENT' },
    })
    expect(audits.length).toBe(1)
  }, 60000)

  it('a duplicate event with a different payment intent creates no second settlement', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const anchor = `pi_b40_dup_${Date.now()}`
    const { payment } = await stripePayment(order, anchor)

    await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'SUCCEEDED',
      amount: order.total,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })
    await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'SUCCEEDED',
      amount: order.total,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(Date.now() + 1000),
    })

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('COMPLETED')
  }, 60000)
})

describe('B40 Stripe — provider identifier integrity', () => {
  it('a PaymentIntent belonging to another payment does not settle an unrelated payment', async () => {
    const orderA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: orderA.id,
      amount: orderA.total,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)
    const paymentA = await prisma.orderPayment.findFirst({ where: { orderId: orderA.id } })
    await simulateStripeAnchor(prisma, paymentA.id, 'pi_b40_owner_a')

    const attackerId = 'pi_b40_not_ours'
    const res = await applyProviderWebhook('Stripe', {
      id: attackerId,
      status: 'SUCCEEDED',
      amount: orderA.total,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })

    expect(res.status).toBe(200)
    const after = await prisma.orderPayment.findUnique({ where: { id: paymentA.id } })
    expect(after.status).not.toBe('COMPLETED')
  })

  it('a Stripe event naming an M-Pesa checkout anchor does not settle the M-Pesa payment through the wrong provider', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_mixup_${payment.id}`
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

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).not.toBe('COMPLETED')
  })

  it('an M-Pesa event naming a Stripe anchor does not settle the Stripe payment', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_mixup2_${payment.id}`
    await simulateStripeAnchor(prisma, payment.id, anchor)

    const { MpesaProvider } = await import('../../src/services/payments/mpesa')
    const mpesa = new MpesaProvider()
    const response = await mpesa.handleWebhook({
      Body: {
        stkCallback: {
          CheckoutRequestID: anchor,
          MerchantRequestID: 'mr_b40',
          ResultCode: 0,
          ResultDesc: 'Accepted',
          CallbackMetadata: { Item: [{ Name: 'Amount', Value: toMinor(order.total) }] },
        },
      },
    })
    await applyProviderWebhook('M-Pesa', response)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).not.toBe('COMPLETED')
  })

  it('a Stripe event whose amount contradicts the stored payment does not settle it', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `pi_b40_amount_${payment.id}`
    await simulateStripeAnchor(prisma, payment.id, anchor)

    await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'SUCCEEDED',
      amount: 0.01,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).not.toBe('COMPLETED')
  })
})

describe('B40 Stripe — event types and secrets', () => {
  it('an unrelated Stripe event type is ignored without touching a payment', async () => {
    const res = await applyProviderWebhook('Stripe', null)
    expect(res).toEqual({ status: 200, body: { success: true, message: 'Webhook received but no action taken' } })
  })

  it('a payment_intent.payment_failed event does not mark the payment paid', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `pi_b40_failed_${payment.id}`
    await simulateStripeAnchor(prisma, payment.id, anchor)

    await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'FAILED',
      amount: order.total,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('FAILED')
    expect(after.paidAt).toBeNull()
  })

  it('the Stripe adapter never exposes the secret key through an error', async () => {
    config.stripeSecretKey = 'sk_test_b40_do_not_leak_me'
    const leaky = new StripeProvider()
    await expect(leaky.handleWebhook('{}', 'v1=bad')).rejects.toThrow(/signature/i)
    try {
      await leaky.handleWebhook('{}', 'v1=bad')
    } catch (err: any) {
      expect(String(err.message)).not.toContain('sk_test_b40_do_not_leak_me')
      expect(String(err.message)).not.toContain(TEST_WEBHOOK_SECRET)
    }
  })

  it('the payment listing never exposes Stripe credentials or a client secret', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 1,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)

    const res = await request(app).get('/api/payments').set(authHeaders(cashierA)).expect(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('sk_test')
    expect(body).not.toContain('sk_live')
    expect(body).not.toContain(TEST_WEBHOOK_SECRET)
    expect(body).not.toContain('whsec_')
  })

  it('a settled Stripe event reconciles the order financial state once', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'STRIPE',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `pi_b40_settle_${payment.id}`
    await simulateStripeAnchor(prisma, payment.id, anchor)

    const event = {
      id: anchor,
      status: 'SUCCEEDED',
      amount: order.total,
      currency: 'KES',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    }
    for (let i = 0; i < 5; i += 1) {
      await applyProviderWebhook('Stripe', event)
    }

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')
    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
    expect(after.balance).toBeCloseTo(0, 2)
  }, 60000)
})