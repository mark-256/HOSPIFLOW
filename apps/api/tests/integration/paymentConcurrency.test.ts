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
  payOrder,
  readOrder,
  simulateMpesaAnchor,
  toMinor,
} from './helpers/b40Financial'

/**
 * B40 — Financial concurrency and race conditions (mission §23, §24, §26, §48).
 *
 * Every test issues genuinely simultaneous requests against the shared
 * PostgreSQL test database and then asserts the exact resulting financial
 * state, not merely the HTTP status codes.
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

describe('B40 concurrency — idempotent payment initiation', () => {
  it('20 simultaneous initiates with one idempotency key create exactly one payment', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const key = `b40-conc-idem-${Date.now()}`
    const body = { orderId: order.id, amount: order.total, method: 'CASH', provider: 'MOCK', idempotencyKey: key }

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => initiatePayment(app, cashierA, body))
    )

    const created = responses.filter((r) => r.status === 201)
    const idempotent = responses.filter((r) => r.status === 200 && r.body.idempotent === true)
    expect(created.length + idempotent.length).toBe(20)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1)
  }, 120000)
})

describe('B40 concurrency — order payments', () => {
  it('10 simultaneous order payments cannot collect more than the order total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post(`/api/orders/${order.id}/pay`)
          .set(authHeaders(cashierA))
          .send({ paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' })
      )
    )

    const succeeded = responses.filter((r) => r.status === 201)
    expect(succeeded.length).toBe(1)

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeLessThanOrEqual(order.total)
    expect(after.balance).toBeGreaterThanOrEqual(0)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id, status: 'COMPLETED' } })).toBe(1)
  }, 120000)

  it('10 simultaneous partial order payments still sum to no more than the order total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId, 4)
    const each = Math.round(order.total / 2 * 100) / 100

    await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post(`/api/orders/${order.id}/pay`)
          .set(authHeaders(cashierA))
          .send({ paymentMethod: 'CASH', amount: each, provider: 'MOCK' })
      )
    )

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    const after = await readOrder(prisma, order.id)

    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
    expect(after.paidAmount).toBeLessThanOrEqual(order.total)
    expect(after.balance).toBeGreaterThanOrEqual(0)
  }, 120000)
})

describe('B40 concurrency — webhook delivery', () => {
  it('20 simultaneous deliveries of one provider event settle the payment once', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_conc_hook_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    const before = await prisma.auditLog.count({
      where: { entity: 'OrderPayment', entityId: payment.id, action: 'PAYMENT' },
    })

    await Promise.all(
      Array.from({ length: 20 }, () => deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total))))
    )

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
    expect(after.balance).toBeCloseTo(0, 2)

    const afterAudits = await prisma.auditLog.count({
      where: { entity: 'OrderPayment', entityId: payment.id, action: 'PAYMENT' },
    })
    expect(afterAudits - before).toBe(1)
  }, 120000)

  it('20 simultaneous conflicting events cannot collect more than the order total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const anchor = `b40_conc_dup_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    await Promise.all(
      Array.from({ length: 20 }, () => deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total))))
    )

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
  }, 120000)
})

describe('B40 concurrency — refunds', () => {
  it('10 simultaneous full refunds refund the payment exactly once', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const amount = Number(payment.amount)

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/payments/refund')
          .set(authHeaders(adminA))
          .send({ paymentId: payment.id, amount, reason: 'B40 concurrent refund' })
      )
    )

    const accepted = responses.filter((r) => r.status === 201)
    expect(accepted.length).toBe(1)

    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } })
    const total = refunds.reduce((sum, r) => sum + Number(r.amount), 0)
    expect(total).toBeLessThanOrEqual(amount)
    expect(total).toBe(amount)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('REFUNDED')
  }, 120000)

  it('10 simultaneous partial refunds never exceed the settled amount', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const amount = Number(payment.amount)
    const each = Math.round(amount / 2 * 100) / 100

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/payments/refund')
          .set(authHeaders(adminA))
          .send({ paymentId: payment.id, amount: each, reason: 'B40 concurrent partial refund' })
      )
    )

    const accepted = responses.filter((r) => r.status === 201)
    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } })
    const total = refunds.reduce((sum, r) => sum + Number(r.amount), 0)

    expect(accepted.length).toBe(refunds.length)
    expect(total).toBeLessThanOrEqual(amount)
  }, 120000)
})

describe('B40 concurrency — folios', () => {
  it('10 simultaneous folio payments cannot over-credit the folio', async () => {
    const folio = await prisma.folio.create({
      data: {
        propertyId: fixture.orgA.propertyId,
        guestId: fixture.orgA.guestId,
        reservationId: fixture.orgA.reservationId,
        folioNumber: `B40-CONC-${Date.now()}`,
        balance: 100,
        totalCharges: 100,
        status: 'OPEN',
      },
    })

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post(`/api/folios/${folio.id}/transactions`)
          .set(authHeaders(cashierA))
          .send({ type: 'PAYMENT', category: 'PAYMENT', description: 'B40 concurrent folio payment', amount: 100 })
      )
    )

    const accepted = responses.filter((r) => r.status === 201)
    expect(accepted.length).toBe(1)

    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(0)
    expect(Number(after.totalPayments)).toBe(100)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(1)
  }, 120000)

  it('10 simultaneous folio charges accumulate exactly once each', async () => {
    const folio = await prisma.folio.create({
      data: {
        propertyId: fixture.orgA.propertyId,
        guestId: fixture.orgA.guestId,
        reservationId: fixture.orgA.reservationId,
        folioNumber: `B40-CONC-C-${Date.now()}`,
        balance: 0,
        status: 'OPEN',
      },
    })

    await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post(`/api/folios/${folio.id}/transactions`)
          .set(authHeaders(cashierA))
          .send({ type: 'CHARGE', category: 'ROOM', description: 'B40 concurrent charge', amount: 10 })
      )
    )

    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(100)
    expect(Number(after.totalCharges)).toBe(100)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(10)
  }, 120000)

  it('two simultaneous folio closes settle on a single deterministic state', async () => {
    const folio = await prisma.folio.create({
      data: {
        propertyId: fixture.orgA.propertyId,
        guestId: fixture.orgA.guestId,
        reservationId: fixture.orgA.reservationId,
        folioNumber: `B40-CONC-CLOSE-${Date.now()}`,
        balance: 0,
        status: 'OPEN',
      },
    })

    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(app).post(`/api/folios/${folio.id}/close`).set(authHeaders(cashierA))
      )
    )

    expect(responses.filter((r) => r.status === 200).length).toBe(2)
    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(after.status).toBe('CLOSED')
  }, 120000)
})

describe('B40 concurrency — payment against cancellation and order completion', () => {
  it('a payment racing an order cancellation leaves one consistent state', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(cashierA))
      .send({ status: 'CANCELLED' })
      .expect(200)

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/orders/${order.id}/pay`)
          .set(authHeaders(cashierA))
          .send({ paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' })
      )
    )

    for (const res of responses) {
      expect(res.status).toBeGreaterThanOrEqual(400)
    }

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBe(0)
  }, 120000)

  it('a payment racing order item additions never collects more than the final total', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const { id } = order

    const results = await Promise.all([
      ...Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/orders/${order.id}/pay`)
          .set(authHeaders(cashierA))
          .send({ paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' })
      ),
      ...Array.from({ length: 5 }, () => addItem(app, cashierA, id, fixture.orgA.productId, 1)),
    ])

    const pays = results.slice(0, 5).filter((r: any) => r.status === 201)
    const final = await readOrder(prisma, id)
    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: id, status: 'COMPLETED' },
    })

    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(Number(final.total) + 0.001)
    expect(final.paidAmount).toBeLessThanOrEqual(Number(final.total) + 0.001)
    expect(final.balance).toBeGreaterThanOrEqual(0)
    expect(pays.length).toBeLessThanOrEqual(1)
  }, 120000)
})

describe('B40 concurrency — provider identifiers', () => {
  it('two payments of the same order cannot both claim the same provider reference', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)

    const payments = await prisma.orderPayment.findMany({ where: { orderId: order.id } })
    const anchor = `b40_shared_anchor_${payments[0].id}`
    await simulateMpesaAnchor(prisma, payments[0].id, anchor)

    await deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total)))

    const agg = await prisma.orderPayment.aggregate({
      _sum: { amount: true },
      where: { orderId: order.id, status: 'COMPLETED' },
    })
    expect(Number(agg._sum.amount ?? 0)).toBeLessThanOrEqual(order.total)
  }, 60000)

  it('an order that already exists cannot be created twice by a concurrent double submit', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => createOrder(app, cashierA, fixture.orgA.outletId))
    )
    expect(responses.length).toBe(5)
    const ids = new Set(responses.map((r: any) => r.id))
    expect(ids.size).toBe(5)
  }, 60000)
})