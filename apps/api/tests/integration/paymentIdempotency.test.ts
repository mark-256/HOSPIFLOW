import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { createOrderWithItems, initiatePayment, readOrder } from './helpers/b40Financial'

/**
 * B40 — Payment idempotency and idempotency-key misuse (mission §22).
 *
 * An Idempotency-Key must return the same logical result for the same request,
 * and must refuse a different request that reuses the key. Silently returning
 * the first result for a different amount is a financial integrity failure: the
 * caller believes it paid a different figure than the one recorded.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let cashierA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

describe('B40 idempotency — initiate', () => {
  it('the same key with the same body returns one payment', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const key = `b40-idem-${Date.now()}`
    const body = { orderId: order.id, amount: 1, method: 'CASH', provider: 'MOCK', idempotencyKey: key }

    const first = await initiatePayment(app, cashierA, body).expect(201)
    const second = await initiatePayment(app, cashierA, body).expect(200)

    expect(second.body.idempotent).toBe(true)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1)
    expect(first.body.success).toBe(true)
  }, 30000)

  it('the same key with a different amount is rejected rather than silently replayed', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const key = `b40-idem-amount-${Date.now()}`

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
      idempotencyKey: key,
    }).expect(201)

    const res = await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: 999,
      method: 'CASH',
      provider: 'MOCK',
      idempotencyKey: key,
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.body.success).toBe(false)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    expect(Number(payment.amount)).toBe(1)
  }, 30000)

  it('the same key against a different order does not replay the first payment', async () => {
    const orderA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const orderB = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const key = `b40-idem-cross-${Date.now()}`

    const first = await initiatePayment(app, cashierA, {
      orderId: orderA.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
      idempotencyKey: key,
    }).expect(201)

    await initiatePayment(app, cashierA, {
      orderId: orderB.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
      idempotencyKey: key,
    }).expect(201)

    const paymentA = await prisma.orderPayment.findFirst({ where: { orderId: orderA.id } })
    const paymentB = await prisma.orderPayment.findFirst({ where: { orderId: orderB.id } })
    expect(paymentA.id).not.toBe(paymentB.id)
    expect(first.body.success).toBe(true)
  }, 30000)

  it('a client-supplied reference cannot become another request idempotency anchor', async () => {
    const orderA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const orderB = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)

    // Order B's pay endpoint dedupes on OrderPayment.reference. If initiate let a
    // caller write `reference`, that caller could pre-seed the anchor and suppress
    // a legitimate later payment.
    await initiatePayment(app, cashierA, {
      orderId: orderA.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
      description: 'B40 reference probe',
    }).expect(201)

    const probe = await prisma.orderPayment.findFirst({ where: { orderId: orderA.id } })
    const chosen = 'b40-collision-reference'

    await initiatePayment(app, cashierA, {
      orderId: orderB.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
      metadata: { reference: chosen },
    })

    const seeded = await prisma.orderPayment.findFirst({ where: { orderId: orderB.id } })
    expect(seeded.reference).not.toBe(chosen)
    expect(probe.reference).not.toBe(chosen)

    const paid = await request(app)
      .post(`/api/orders/${orderB.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': chosen })
      .send({ paymentMethod: 'CASH', amount: Number((await readOrder(prisma, orderB.id)).balance) })
    expect(paid.status).toBe(201)
    expect(paid.body.meta?.deduplicated).not.toBe(true)
  }, 30000)

  it('distinct keys create distinct payments', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    for (const suffix of ['a', 'b', 'c']) {
      await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount: 1,
        method: 'CASH',
        provider: 'MOCK',
        idempotencyKey: `b40-idem-distinct-${Date.now()}-${suffix}`,
      }).expect(201)
    }
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(3)
  }, 30000)
})

describe('B40 idempotency — order pay', () => {
  it('repeating the pay call with one key charges the order once', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const key = `b40-pay-idem-${Date.now()}`
    const body = { paymentMethod: 'CASH', amount: order.total, provider: 'MOCK' }

    const first = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': key })
      .send(body)
      .expect(201)

    const second = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': key })
      .send(body)
      .expect(200)

    expect(second.body.meta.deduplicated).toBe(true)
    expect(second.body.data.id).toBe(first.body.data.id)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1)

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
    expect(after.balance).toBeCloseTo(0, 2)
  }, 30000)

  it('the same pay key with a different amount is rejected', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const key = `b40-pay-idem-amount-${Date.now()}`

    await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': key })
      .send({ paymentMethod: 'CASH', amount: 1, provider: 'MOCK' })
      .expect(201)

    const res = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set({ ...authHeaders(cashierA), 'Idempotency-Key': key })
      .send({ paymentMethod: 'CASH', amount: 5, provider: 'MOCK' })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.orderPayment.count({ where: { orderId: order.id } })).toBe(1)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    expect(Number(payment.amount)).toBe(1)
  }, 30000)

  it('repeating a settlement does not credit the order twice', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'CASH',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/api/payments/verify')
        .set(authHeaders(cashierA))
        .send({ paymentId: payment.id })
        .expect(200)
    }

    const after = await readOrder(prisma, order.id)
    expect(after.paidAmount).toBeCloseTo(order.total, 2)
  }, 30000)
})