import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { createOrderWithItems, readOrder } from './helpers/b40Financial'

/**
 * B40 — Order payment integrity (mission §27, §28, §29).
 *
 * The order is the authoritative financial record for a POS sale. Its total comes
 * from authoritative product prices, its collection must never exceed that
 * total, and its status must not change on the basis of client input.
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

function pay(orderId: string, body: Record<string, unknown>, token: AuthTokens = cashierA, idempotencyKey?: string) {
  const headers = idempotencyKey ? { ...authHeaders(token), 'Idempotency-Key': idempotencyKey } : authHeaders(token)
  return request(app).post(`/api/orders/${orderId}/pay`).set(headers).send(body)
}

describe('B40 order payments — exact, partial and remaining', () => {
  it('paying the exact total settles the order collection', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' }).expect(201)

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
    expect(after.balance).toBeCloseTo(0, 2)
  }, 30000)

  it('paying partially leaves the remainder outstanding', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId, 2)
    const part = Math.round(order.total / 2 * 100) / 100

    await pay(order.id, { paymentMethod: 'CASH', amount: part, provider: 'MOCK' }).expect(201)
    const midway = await readOrder(prisma, order.id)
    expect(midway.paidAmount).toBeCloseTo(part, 2)
    expect(midway.balance).toBeCloseTo(order.total - part, 2)

    await pay(order.id, { paymentMethod: 'CASH', amount: midway.balance, provider: 'MOCK' }).expect(201)
    const final = await readOrder(prisma, order.id)
    expect(final.paidAmount).toBeCloseTo(order.total, 2)
    expect(final.balance).toBeCloseTo(0, 2)
  }, 30000)

  it('paying more than the balance is refused (the existing overpayment rule)', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await pay(order.id, { paymentMethod: 'CASH', amount: order.total + 500, provider: 'MOCK' })
    expect(res.status).toBe(400)

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBe(0)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0)
  }, 30000)

  it('a zero payment is refused', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await pay(order.id, { paymentMethod: 'CASH', amount: 0, provider: 'MOCK' })
    expect(res.status).toBe(400)
    expect((await readOrder(prisma, order.id)).paidAmount).toBe(0)
  }, 30000)

  const hostile: Array<[string, unknown]> = [
    ['negative', -10],
    ['non numeric string', 'abc'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['array', [10]],
    ['object', { amount: 10 }],
    ['null', null],
    ['absent', undefined],
    ['absurdly large', 1e30],
  ]

  for (const [label, amount] of hostile) {
    it(`a hostile order payment amount (${label}) is a 4xx, never an unhandled 500`, async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      const res = await pay(order.id, { paymentMethod: 'CASH', amount, provider: 'MOCK' })
      expect(res.status).toBeLessThan(500)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect((await readOrder(prisma, order.id)).paidAmount).toBe(0)
    }, 30000)
  }

  it('an invalid paymentMethod is a 400, not a database error', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    for (const paymentMethod of ['MOCK', 'CRYPTO', '', 42, null]) {
      const res = await pay(order.id, { paymentMethod, amount: order.total, provider: 'MOCK' })
      expect(res.status).toBeLessThan(500)
      expect(res.status).toBeGreaterThanOrEqual(400)
    }
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0)
  }, 60000)

  it('an invalid provider is a 400, not a database error', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'NOT_A_PROVIDER' })
    expect(res.status).toBeLessThan(500)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0)
  }, 30000)
})

describe('B40 order payments — order state', () => {
  it('a cancelled order cannot be paid', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(cashierA))
      .send({ status: 'CANCELLED' })
      .expect(200)

    const res = await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect((await readOrder(prisma, order.id)).paidAmount).toBe(0)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(0)
  }, 30000)

  it('paying twice in sequence cannot collect more than the order total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

    await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' }).expect(201)
    const second = await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' })
    expect(second.status).toBe(400)

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeCloseTo(order.total, 2)
  }, 30000)

  it('paying a different tenant order is refused', async () => {
    const before = await prisma.order.findUnique({ where: { id: fixture.orgB.orderId } })
    const res = await pay(fixture.orgB.orderId, { paymentMethod: 'CASH', amount: 10, provider: 'MOCK' }, adminA)
    expect([403, 404]).toContain(res.status)
    const after = await prisma.order.findUnique({ where: { id: fixture.orgB.orderId } })
    expect(Number(after.paidAmount)).toBe(Number(before.paidAmount))
  }, 30000)

  it('the pay endpoint requires the payments_process permission', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const chef = await login(app, fixture.emails.chefA, fixture.passwords.chefA)
    const res = await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' }, chef)
    expect(res.status).toBe(403)
    expect((await readOrder(prisma, order.id)).paidAmount).toBe(0)
  }, 30000)

  it('an unauthenticated caller cannot pay an order', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .send({ paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' })
    expect(res.status).toBe(401)
  }, 30000)

  it('paying does not itself move the order status', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await pay(order.id, { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' }).expect(201)

    const after = await prisma.order.findUnique({ where: { id: order.id } })
    expect(after.status).not.toBe('COMPLETED')
  }, 30000)
})

describe('B40 order payments — outlet and property scope', () => {
  it('an order of another outlet in the same organization is not reachable cross-tenant', async () => {
    const orgBOutletOrder = fixture.orgB.orderId
    const res = await pay(orgBOutletOrder, { paymentMethod: 'CASH', amount: 1, provider: 'MOCK' }, adminA)
    expect([403, 404]).toContain(res.status)
  }, 30000)

  it('the order the payment belongs to is the order the caller named', async () => {
    const orderA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await pay(orderA.id, { paymentMethod: 'CASH', amount: orderA.total, provider: 'MOCK' }, cashierA, 'b40-scope-key').expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: orderA.id } })
    expect(payment.orderId).toBe(orderA.id)

    const stored = await prisma.order.findUnique({
      where: { id: payment.orderId },
      include: { outlet: { include: { property: true } } },
    })
    expect(stored.outletId).toBe(fixture.orgA.outletId)
    expect(stored.outlet.property.organizationId).toBe(fixture.orgA.organizationId)
  }, 30000)
})

describe('B40 order payments — item price integrity during payment', () => {
  it('adding items after a partial payment cannot make the collected amount exceed the total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId, 2)
    const part = Math.round(order.total / 2 * 100) / 100
    await pay(order.id, { paymentMethod: 'CASH', amount: part, provider: 'MOCK' }).expect(201)

    await request(app)
      .post(`/api/orders/${order.id}/items`)
      .set(authHeaders(cashierA))
      .send({ productId: fixture.orgA.productId, quantity: 1 })
      .expect(201)

    const midway = await readOrder(prisma, order.id)
    const rest = await pay(order.id, { paymentMethod: 'CASH', amount: midway.balance, provider: 'MOCK' })
    expect(rest.status).toBe(201)

    const final = await readOrder(prisma, order.id)
    expect(final.paidAmount).toBeCloseTo(final.total, 2)
    expect(final.balance).toBeCloseTo(0, 2)
  }, 30000)

  it('an order created with client-supplied totals keeps the authoritative total', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeaders(cashierA))
      .send({
        outletId: fixture.orgA.outletId,
        orderType: 'DINE_IN',
        total: 0.01,
        subtotal: 0.01,
        balance: 0.01,
        paidAmount: 999999,
        discount: 999999,
        tax: 999999,
        currency: 'USD',
      })
      .expect(201)

    const after = await readOrder(prisma, res.body.data.id)
    expect(after.total).toBe(0)
    expect(after.balance).toBe(0)
    expect(after.paidAmount).toBe(0)
    expect(after.currency).toBe('KES')
  }, 30000)
})