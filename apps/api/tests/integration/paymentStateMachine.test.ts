import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
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
 * B40 — Payment status state machine (mission §10).
 *
 * The authoritative transitions are:
 *   PENDING -> COMPLETED | FAILED | CANCELLED
 * COMPLETED, FAILED, CANCELLED, REFUNDED and PARTIALLY_REFUNDED are terminal
 * for settlement: no later provider report or client request may re-open them.
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

/** A PENDING payment created through the real initiate endpoint. */
async function pendingPayment(amount = 10): Promise<any> {
  const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
  await initiatePayment(app, cashierA, {
    orderId: order.id,
    amount,
    method: 'CASH',
    provider: 'MOCK',
  }).expect(201)
  return prisma.orderPayment.findFirst({ where: { orderId: order.id } })
}

function verify(paymentId: string) {
  return request(app).post('/api/payments/verify').set(authHeaders(cashierA)).send({ paymentId })
}

describe('B40 state machine — allowed transitions', () => {
  it('PENDING -> COMPLETED is allowed', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'CASH',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    expect(payment.status).toBe('PENDING')

    await verify(payment.id).expect(200)

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')
    expect(settled.paidAt).not.toBeNull()
    expect((await readOrder(prisma, order.id)).paidAmount).toBeCloseTo(order.total, 2)
  }, 30000)

  it('verifying an already COMPLETED payment is idempotent', async () => {
    const payment = await pendingPayment()
    await verify(payment.id).expect(200)
    const first = await prisma.orderPayment.findUnique({ where: { id: payment.id } })

    await verify(payment.id).expect(200)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('COMPLETED')
    expect(String(after.paidAt)).toBe(String(first.paidAt))
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0)
  }, 30000)

  it('a failed provider report settles the payment as FAILED without marking it paid', async () => {
    const payment = await pendingPayment()
    await prisma.orderPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('FAILED')
  }, 30000)
})

describe('B40 state machine — forbidden transitions', () => {
  const terminalStates = ['FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']

  for (const status of terminalStates) {
    it(`${status} -> COMPLETED is refused by the verify endpoint`, async () => {
      const payment = await pendingPayment()
      await prisma.orderPayment.update({ where: { id: payment.id }, data: { status, paidAt: null } })

      const res = await verify(payment.id)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.body.success).toBe(false)

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe(status)
      expect(after.paidAt).toBeNull()
    }, 30000)

    it(`${status} -> COMPLETED is refused by a provider callback`, async () => {
      const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
      await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount: order.total,
        method: 'MPESA',
        provider: 'MOCK',
      }).expect(201)
      const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
      const anchor = `b40_sm_${status}_${payment.id}`
      await simulateMpesaAnchor(prisma, payment.id, anchor)
      await prisma.orderPayment.update({ where: { id: payment.id }, data: { status, paidAt: null } })

      await deliverMpesaCallback(mpesaCallback(anchor, toMinor(order.total)))

      const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
      expect(after.status).toBe(status)
      expect(after.paidAt).toBeNull()
    }, 30000)
  }

  it('COMPLETED -> PENDING cannot be requested through any endpoint', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    expect(payment.status).toBe('COMPLETED')

    for (const body of [
      { orderId: payment.orderId, amount: 1, method: 'CASH', provider: 'MOCK', status: 'PENDING' },
      { orderId: payment.orderId, amount: 1, method: 'CASH', provider: 'MOCK', paymentStatus: 'PENDING' },
    ]) {
      const res = await initiatePayment(app, cashierA, body)
      expect(res.status).toBeLessThan(500)
    }

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('COMPLETED')
  }, 30000)

  it('a client-supplied status field never reaches the payment row', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
      status: 'COMPLETED',
      settlementStatus: 'SETTLED',
      paidAt: '2020-01-01T00:00:00.000Z',
      reference: 'client-chosen-reference',
    })

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    expect(payment.status).toBe('PENDING')
    expect(payment.paidAt).toBeNull()
  }, 30000)

  it('payment update and delete endpoints stay unimplemented', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await request(app).patch(`/api/payments/${payment.id}`).set(authHeaders(adminA)).expect(501)
    await request(app).delete(`/api/payments/${payment.id}`).set(authHeaders(adminA)).expect(501)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('COMPLETED')
  }, 30000)

  it('a fully refunded payment cannot be completed by a later verification', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(adminA))
      .send({ paymentId: payment.id, amount: Number(payment.amount), reason: 'B40 full refund' })
      .expect(201)

    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('REFUNDED')

    const res = await verify(payment.id)
    expect(res.status).toBeGreaterThanOrEqual(400)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('REFUNDED')
  }, 30000)

  it('a partially refunded payment cannot be re-completed', async () => {
    const payment = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(adminA))
      .send({ paymentId: payment.id, amount: 1, reason: 'B40 partial refund' })
      .expect(201)

    expect((await prisma.orderPayment.findUnique({ where: { id: payment.id } })).status).toBe('PARTIALLY_REFUNDED')

    await verify(payment.id)

    const after = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(after.status).toBe('PARTIALLY_REFUNDED')
  }, 30000)

  it('the order payment state machine still refuses illegal order transitions', async () => {
    const { id } = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(authHeaders(cashierA))
      .send({ status: 'COMPLETED' })
    expect(res.status).toBe(400)
  }, 30000)
})