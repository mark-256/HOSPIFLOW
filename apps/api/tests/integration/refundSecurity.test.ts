import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { config } from '../../src/config'
import { payOrder } from './helpers/b40Financial'

/**
 * B40 — Refund integrity (mission §17, §30).
 *
 * Refunds must be bounded by the settled amount, authorised, atomic under
 * concurrency, reconciled against the order's authoritative collection, and
 * must never surface provider internals.
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

function refund(paymentId: string, amount: unknown, token: AuthTokens = adminA, reason = 'B40') {
  return request(app)
    .post('/api/payments/refund')
    .set(authHeaders(token))
    .send({ paymentId, amount, reason })
}

async function refundedTotal(paymentId: string): Promise<number> {
  const refunds = await prisma.refund.findMany({ where: { paymentId } })
  return refunds.reduce((sum, r) => sum + Number(r.amount), 0)
}

describe('B40 refunds — amount bounds', () => {
  it('a full refund succeeds and marks the payment REFUNDED', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await refund(payment.id, Number(payment.amount)).expect(201)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('REFUNDED')
    expect(await refundedTotal(payment.id)).toBeCloseTo(Number(payment.amount), 2)
  }, 30000)

  it('a partial refund is allowed and bounded by the remainder', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const amount = Number(payment.amount)
    const first = Math.round(amount / 2 * 100) / 100

    await refund(payment.id, first).expect(201)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PARTIALLY_REFUNDED')

    const over = await refund(payment.id, amount)
    expect(over.status).toBe(400)
    expect(await refundedTotal(payment.id)).toBeCloseTo(first, 2)
  }, 30000)

  it('a refund larger than the payment is rejected', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await refund(payment.id, Number(payment.amount) * 2 + 1000)
    expect(res.status).toBe(400)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  }, 30000)

  const hostile: Array<[string, unknown]> = [
    ['zero', 0],
    ['negative', -5],
    ['negative decimal', -0.01],
    ['string zero', '0'],
    ['non numeric string', 'free-money'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['array', [5]],
    ['object', { amount: 5 }],
    ['null', null],
    ['absent', undefined],
    ['absurdly large', 1e30],
  ]

  for (const [label, amount] of hostile) {
    it(`a hostile refund amount (${label}) is refused without an unhandled 500`, async () => {
      const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      const res = await refund(payment.id, amount)
      expect(res.status).toBeLessThan(500)
      expect(res.status).toBe(400)
      expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
      expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('COMPLETED')
    }, 30000)
  }

  it('a sub-cent refund is bounded to the exact remainder', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const amount = Number(payment.amount)
    await refund(payment.id, 0.001).expect(201)

    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } })
    expect(refunds[0].amount).not.toBeNull()
    const recorded = Number(refunds[0].amount)
    expect(Math.abs(recorded - 0.001)).toBeLessThanOrEqual(0.005)
    expect(recorded).toBeLessThanOrEqual(amount)
  }, 30000)

  it('a numeric string refund amount is accepted', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await refund(payment.id, String(Number(payment.amount)))
    expect(res.status).toBe(201)
  }, 30000)
})

describe('B40 refunds — authorisation and state', () => {
  it('a refund requires the payments_refund permission', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const chef = await login(app, fixture.emails.chefA, fixture.passwords.chefA)
    const res = await refund(payment.id, 1, chef)
    expect(res.status).toBe(403)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  }, 30000)

  it('another tenant cannot refund a payment', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
    const res = await refund(payment.id, 1, adminB)
    expect([403, 404]).toContain(res.status)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  }, 30000)

  it('a non-existent payment cannot be refunded', async () => {
    const res = await refund('b40-does-not-exist', 1)
    expect(res.status).toBe(404)
  })

  it('a PENDING payment cannot be refunded', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await prisma.orderPayment.update({ where: { id: payment.id }, data: { status: 'PENDING' } })
    const res = await refund(payment.id, 1)
    expect(res.status).toBe(400)
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  }, 30000)

  for (const status of ['FAILED', 'CANCELLED', 'PENDING']) {
    it(`a ${status} payment cannot be refunded`, async () => {
      const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      await prisma.orderPayment.update({ where: { id: payment.id }, data: { status } })
      const res = await refund(payment.id, 1)
      expect(res.status).toBe(400)
      expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
    }, 30000)
  }

  it('a second full refund is refused once the payment is REFUNDED', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await refund(payment.id, Number(payment.amount)).expect(201)
    const res = await refund(payment.id, 1)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await refundedTotal(payment.id)).toBeCloseTo(Number(payment.amount), 2)
  }, 30000)

  it('the refund is attributed to the approving user and the owning tenant order', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await refund(payment.id, 1).expect(201)

    const record = await prisma.refund.findUnique({ where: { id: res.body.data.id } })
    expect(record.paymentId).toBe(payment.id)
    expect(record.approvedBy).toBe(fixture.users.adminA)
  }, 30000)
})

describe('B40 refunds — provider interaction', () => {
  it('a provider that cannot refund produces a client-safe error, not an unhandled 500', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await prisma.orderPayment.update({ where: { id: payment.id }, data: { provider: 'MPESA' } })

    const res = await refund(payment.id, 1)
    const body = JSON.stringify(res.body)
    expect(res.status).toBeLessThan(500)
    expect(body).not.toContain('M-Pesa refunds require manual processing')
    expect(body).not.toContain('C2B')
    expect(body).not.toContain('at ')
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('COMPLETED')
  }, 30000)

  it('the refund reconciliation returns the order balance to the authoritative amount', async () => {
    const order = await createOrderAndPay()
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })

    await refund(payment.id, Number(payment.amount)).expect(201)

    const after = await prisma.order.findUnique({ where: { id: order.id } })
    expect(Number(after.paidAmount)).toBe(0)
    expect(Number(after.balance)).toBeCloseTo(Number(after.total), 2)
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('REFUNDED')
  }, 30000)

  it('a partial refund leaves the remainder collected', async () => {
    const order = await createOrderAndPay()
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const half = Math.round(Number(payment.amount) / 2 * 100) / 100

    await refund(payment.id, half).expect(201)

    const after = await prisma.order.findUnique({ where: { id: order.id } })
    expect(Number(after.paidAmount)).toBeCloseTo(Number(payment.amount) - half, 2)
    expect(Number(after.balance)).toBeCloseTo(Number(after.total) - Number(after.paidAmount), 2)
  }, 30000)
})

describe('B40 refunds — secret hygiene', () => {
  it('the refund response never contains provider credentials', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await refund(payment.id, 1).expect(201)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('sk_live')
    expect(body).not.toContain('sk_test')
    expect(body).not.toContain('Bearer ')
    expect(body).not.toContain('MPESA_CONSUMER_SECRET')
  }, 30000)

  it('the Stripe webhook secret never appears in a payment read', async () => {
    config.stripeWebhookSecret = 'whsec_b40_never_leak'
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await request(app).get(`/api/payments/${payment.id}`).set(authHeaders(adminA)).expect(200)
    expect(JSON.stringify(res.body)).not.toContain('whsec_b40_never_leak')
    config.stripeWebhookSecret = ''
  }, 30000)
})

async function createOrderAndPay() {
  const created = await request(app)
    .post('/api/orders')
    .set(authHeaders(cashierA))
    .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
    .expect(201)

  const orderId = created.body.data.id
  await request(app)
    .post(`/api/orders/${orderId}/items`)
    .set(authHeaders(cashierA))
    .send({ productId: fixture.orgA.productId, quantity: 1 })
    .expect(201)

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  await request(app)
    .post(`/api/orders/${orderId}/pay`)
    .set(authHeaders(cashierA))
    .send({ paymentMethod: 'CASH', amount: Number(order.balance), provider: 'MOCK' })
    .expect(201)

  return prisma.order.findUnique({ where: { id: orderId } })
}