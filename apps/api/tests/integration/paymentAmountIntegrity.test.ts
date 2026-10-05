import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import {
  addItem,
  createOrder,
  createOrderWithItems,
  deliverMpesaCallback,
  initiatePayment,
  mpesaCallback,
  readOrder,
  simulateMpesaAnchor,
  toMinor,
} from './helpers/b40Financial'

/**
 * B40 — Payment amount, order total, product price, currency and decimal
 * integrity (mission §5, §6, §7, §8, §9).
 *
 * The rule under test: a client may request a payment, but the amount that is
 * actually credited is derived from authoritative database values — the product
 * price, the order total and the provider-reported amount — never from a
 * client-supplied number.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let cashierA: AuthTokens
let adminA: AuthTokens
let adminB: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
}, 120000)

afterAll(async () => {
  await disconnect()
})

describe('B40 amounts — the order total is server-authoritative', () => {
  it('a client-supplied unitPrice cannot lower the authoritative product price', async () => {
    const { id } = await createOrder(app, cashierA, fixture.orgA.outletId)
    await addItem(app, cashierA, id, fixture.orgA.productId, 10, { unitPrice: 0.01 }).expect(201)

    const order = await readOrder(prisma, id)
    const product = await prisma.product.findUnique({ where: { id: fixture.orgA.productId } })
    const authoritative = Number(product.price)

    expect(order.total).toBeGreaterThan(1)
    expect(order.total).toBeCloseTo(authoritative * 10, 2)
    expect(order.balance).toBeCloseTo(order.total, 2)
  }, 30000)

  it('a client-supplied unitPrice equal to the authoritative price is accepted unchanged', async () => {
    const product = await prisma.product.findUnique({ where: { id: fixture.orgA.productId } })
    const { id } = await createOrder(app, cashierA, fixture.orgA.outletId)
    await addItem(app, cashierA, id, fixture.orgA.productId, 2, { unitPrice: Number(product.price) }).expect(201)

    const order = await readOrder(prisma, id)
    expect(order.total).toBeCloseTo(Number(product.price) * 2, 2)
  }, 30000)

  it('a client cannot inject subtotal, total, discount or tax when creating order items', async () => {
    const { id } = await createOrder(app, cashierA, fixture.orgA.outletId)
    await addItem(app, cashierA, id, fixture.orgA.productId, 1, {
      total: 0.01,
      subtotal: 0.01,
      discount: 999999,
      tax: 999999,
      lineTotal: 0.01,
    }).expect(201)

    const product = await prisma.product.findUnique({ where: { id: fixture.orgA.productId } })
    const order = await readOrder(prisma, id)
    expect(order.total).toBeCloseTo(Number(product.price), 2)
  }, 30000)

  it('a product from another tenant cannot be added to this tenant order', async () => {
    const { id } = await createOrder(app, cashierA, fixture.orgA.outletId)
    const res = await addItem(app, cashierA, id, fixture.orgB.productId, 1)
    expect(res.status).toBe(404)
    expect((await readOrder(prisma, id)).total).toBe(0)
  }, 30000)

  it('decimal totals accumulate deterministically across many items', async () => {
    const product = await prisma.product.findUnique({ where: { id: fixture.orgA.productId } })
    const { id } = await createOrder(app, cashierA, fixture.orgA.outletId)
    for (let i = 0; i < 3; i += 1) {
      await addItem(app, cashierA, id, fixture.orgA.productId, 1).expect(201)
    }
    const order = await readOrder(prisma, id)
    expect(order.total).toBeCloseTo(Number(product.price) * 3, 2)
    expect(order.total).toBe(Number(order.total.toFixed(2)))
  }, 60000)
})

describe('B40 amounts — hostile payment amounts fail safely', () => {
  const hostileAmounts: Array<[string, unknown]> = [
    ['zero', 0],
    ['negative', -100],
    ['negative decimal', -0.01],
    ['string zero', '0'],
    ['non numeric string', 'not-a-number'],
    ['numeric string is accepted as a number', '12.50'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['array', [10]],
    ['object', { value: 10 }],
    ['boolean', true],
    ['null', null],
    ['absent', undefined],
    ['extremely large', 1e308],
    ['beyond decimal(10,2)', '99999999999999999999999'],
    ['sub-cent precision', 0.001],
  ]

  for (const [label, amount] of hostileAmounts) {
    it(`initiate handles a hostile amount (${label}) without an unhandled 500`, async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      const res = await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount,
        method: 'CARD',
        provider: 'MOCK',
      })
      expect(res.status).toBeLessThan(500)
      if (res.status !== 201) {
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.body.success).toBe(false)
      }
    }, 30000)
  }

  it('the payment record always stores the amount that was validated, never a client string artefact', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: '12.505',
      method: 'CARD',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    expect(String(payment.amount)).toMatch(/^\d+\.\d{2}$/)
  }, 30000)
})

describe('B40 amounts — settlement is bounded by the authoritative order total', () => {
  it('a client-supplied payment amount larger than the order total cannot be settled', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const hostile = order.total * 10

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: hostile,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_overshoot_${Date.now()}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    const res = await deliverMpesaCallback(mpesaCallback(anchor, toMinor(hostile)))
    expect(res.status).toBe(200)

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).not.toBe('COMPLETED')
    expect(settled.paidAt).toBeNull()
  }, 30000)

  it('repeating oversized settlements cannot drive the collected total past the order total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const anchor = `b40_overshoot_many_${Date.now()}`

    for (let i = 0; i < 4; i += 1) {
      await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        method: 'MPESA',
        provider: 'MOCK',
      }).expect(201)
    }
    const payments = await prisma.orderPayment.findMany({ where: { orderId: order.id } })
    for (const payment of payments) {
      await simulateMpesaAnchor(prisma, payment.id, `${anchor}_${payment.id}`)
      await deliverMpesaCallback(mpesaCallback(`${anchor}_${payment.id}`, toMinor(order.total)))
    }

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
  }, 60000)

  it('an exact payment settles and the order financial state reflects it', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const anchor = `b40_exact_${Date.now()}`

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    await simulateMpesaAnchor(prisma, payment.id, anchor)
    await deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total)))

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
    expect(after.balance).toBeCloseTo(0, 2)
  }, 30000)

  it('a partial settlement leaves the authoritative remaining balance', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const part = Math.round(order.total / 2 * 100) / 100
    const anchor = `b40_partial_${Date.now()}`

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: part,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    await simulateMpesaAnchor(prisma, payment.id, anchor)
    await deliverMpesaCallback(mpesaCallback(anchor, toMinor(part)))

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(part, 2)
    expect(after.balance).toBeCloseTo(Number((order.total - part).toFixed(2)), 2)
  }, 30000)

  it('split payments may not exceed the authoritative order total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const third = Math.round(order.total / 3 * 100) / 100

    for (let i = 0; i < 5; i += 1) {
      await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount: third,
        method: 'MPESA',
        provider: 'MOCK',
      }).expect(201)
    }

    const payments = await prisma.orderPayment.findMany({ where: { orderId: order.id } })
    for (const payment of payments) {
      const anchor = `b40_split_${payment.id}`
      await simulateMpesaAnchor(prisma, payment.id, anchor)
      await deliverMpesaCallback(mpesaCallback(anchor, toMinor(third)))
    }

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
  }, 60000)

  it('settlement through the verify endpoint is bounded by the order total too', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total * 4,
      method: 'CASH',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })

    await request(app)
      .post('/api/payments/verify')
      .set(authHeaders(cashierA))
      .send({ paymentId: payment.id })
      .expect(200)

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
  }, 30000)
})

describe('B40 amounts — currency integrity', () => {
  it('HOSPIFLOW stores a single authoritative currency on the order and folio', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    expect(order.currency).toBe('KES')
    const folio = await prisma.folio.findUnique({ where: { id: fixture.orgA.folioId } })
    expect(String(folio.currency)).toBe('KES')
  }, 30000)

  it('a client-supplied currency field does not change the authoritative currency', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 1,
      method: 'CARD',
      provider: 'MOCK',
      currency: 'USD',
    })

    const after = await readOrder(prisma, order.id)
    expect(after.currency).toBe('KES')
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    expect(payment.currency).toBeUndefined()
  }, 30000)

  it('a provider callback in a different currency never settles a KES payment', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const anchor = `b40_currency_${Date.now()}`

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    const { applyProviderWebhook } = await import('../../src/services/paymentWebhookService')
    const res = await applyProviderWebhook('Stripe', {
      id: anchor,
      status: 'SUCCEEDED',
      amount: order.total,
      currency: 'USD',
      provider: 'STRIPE',
      method: 'CARD',
      createdAt: new Date(),
    })

    expect(res.status).toBe(200)
    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).not.toBe('COMPLETED')
    expect(settled.paidAt).toBeNull()
  }, 30000)
})

describe('B40 amounts — a payment belongs to the authorized financial context', () => {
  it('a payment cannot be created against another tenant order', async () => {
    const res = await initiatePayment(app, adminA, {
      orderId: fixture.orgB.orderId,
      amount: 1,
      method: 'CARD',
      provider: 'MOCK',
    })
    expect([403, 404]).toContain(res.status)
    expect(await prisma.orderPayment.count({ where: { orderId: fixture.orgB.orderId } })).toBe(0)
  }, 30000)

  it('the payment is written against the order the caller owns, not a client-supplied organization', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 1,
      method: 'CARD',
      provider: 'MOCK',
      organizationId: fixture.orgB.organizationId,
      outletId: fixture.orgB.outletId,
      propertyId: fixture.orgB.propertyId,
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const stored = await prisma.order.findUnique({
      where: { id: payment.orderId },
      include: { outlet: { include: { property: true } } },
    })
    expect(stored.outlet.property.organizationId).toBe(fixture.orgA.organizationId)
    expect(stored.outletId).toBe(fixture.orgA.outletId)
  }, 30000)

  it('the tenant that owns an order cannot be switched by client input', async () => {
    const orderA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const before = await readOrder(prisma, orderA.id)

    await initiatePayment(app, cashierA, {
      orderId: orderA.id,
      amount: before.total,
      method: 'CASH',
      provider: 'MOCK',
      orderIdOverride: fixture.orgB.orderId,
    })

    const after = await readOrder(prisma, orderA.id)
    expect(after.total).toBe(before.total)
    expect(after.paidAmount).toBe(0)
  }, 30000)

  it('a tenant cannot pay another tenant order by presenting that order number', async () => {
    const orderB = await prisma.order.findUnique({ where: { id: fixture.orgB.orderId } })
    const res = await request(app)
      .post('/api/payments/initiate')
      .set(authHeaders(adminA))
      .send({ orderId: fixture.orgB.orderId, amount: 1, method: 'CASH', provider: 'MOCK', reference: orderB.orderNumber })
    expect([403, 404]).toContain(res.status)
    expect(await prisma.orderPayment.count({ where: { orderId: fixture.orgB.orderId } })).toBe(0)
  }, 30000)

  it('a cross-tenant order payment is refused by the order pay endpoint as well', async () => {
    const res = await request(app)
      .post(`/api/orders/${fixture.orgB.orderId}/pay`)
      .set(authHeaders(adminA))
      .send({ paymentMethod: 'CASH', amount: 10, provider: 'MOCK' })
    expect([403, 404]).toContain(res.status)

    const order = await prisma.order.findUnique({ where: { id: fixture.orgB.orderId } })
    expect(Number(order.paidAmount)).toBe(0)
  }, 30000)

  it('an unauthenticated caller cannot initiate a payment', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await request(app)
      .post('/api/payments/initiate')
      .send({ orderId: order.id, amount: 1, method: 'CASH', provider: 'MOCK' })
    expect(res.status).toBe(401)
  }, 30000)

  it('org B can never see org A payment rows through the list endpoint', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const created = await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 1,
      method: 'CARD',
      provider: 'MOCK',
    })
    const paymentId = created.body.data.id || (await prisma.orderPayment.findFirst({ where: { orderId: order.id } })).id

    const res = await request(app).get('/api/payments').set(authHeaders(adminB)).expect(200)
    expect(res.body.data.map((p: any) => p.id)).not.toContain(paymentId)

    const single = await request(app).get(`/api/payments/${paymentId}`).set(authHeaders(adminB))
    expect([403, 404]).toContain(single.status)
  }, 30000)
})