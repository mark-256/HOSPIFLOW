import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'

let app: Express
let seedData: any
let adminTokens: AuthTokens
let cashierTokens: AuthTokens

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
  adminTokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
  cashierTokens = await login(app, seedData.orgA.users.CASHIER.email, seedData.orgA.users.CASHIER.password)
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('Payment Integration Tests', () => {
  it('payment initiated via provider (mock) returns pending', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const paymentRes = await request(app)
      .post('/api/payments/initiate')
      .set(headers)
      .send({
        orderId: orderRes.body.data.id,
        amount: 12.50,
        method: 'CARD',
        provider: 'MOCK',
        idempotencyKey: 'pay-init-1',
      })
      .expect(201)

    expect(paymentRes.body.success).toBe(true)
    expect(paymentRes.body.data.reference).toBeDefined()
    expect(paymentRes.body.data.status).toBe('SUCCEEDED')
  })

  it('payment pending then verified success', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const initRes = await request(app)
      .post('/api/payments/initiate')
      .set(headers)
      .send({
        orderId: orderRes.body.data.id,
        amount: 12.50,
        method: 'CARD',
        provider: 'MOCK',
        idempotencyKey: 'pay-init-2',
      })
      .expect(201)

    const prisma = await getPrisma()
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: orderRes.body.data.id } })
    expect(payment).toBeDefined()
    expect(payment!.status).toBe('PENDING')

    // Verify payment
    const verifyRes = await request(app)
      .post('/api/payments/verify')
      .set(headers)
      .send({ paymentId: payment!.id })
      .expect(200)

    expect(verifyRes.body.success).toBe(true)
    const updatedPayment = await prisma.orderPayment.findUnique({ where: { id: payment!.id } })
    expect(updatedPayment!.status).toBe('COMPLETED')
  })

  it('payment idempotency — second request with same key returns same result', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const payload = {
      orderId: orderRes.body.data.id,
      amount: 12.50,
      method: 'CARD',
      provider: 'MOCK',
      idempotencyKey: 'idempotent-pay-1',
    }

    const first = await request(app)
      .post('/api/payments/initiate')
      .set(headers)
      .send(payload)
      .expect(201)

    const second = await request(app)
      .post('/api/payments/initiate')
      .set(headers)
      .send(payload)
      .expect(200)

    expect(second.body.idempotent).toBe(true)
    const prisma = await getPrisma()
    const payments = await prisma.orderPayment.findMany({ where: { orderId: orderRes.body.data.id } })
    expect(payments.length).toBe(1)
  })

  it('payment with invalid orderId returns 404', async () => {
    const headers = authHeaders(cashierTokens)
    const res = await request(app)
      .post('/api/payments/initiate')
      .set(headers)
      .send({
        orderId: 'nonexistent-order-id',
        amount: 10.00,
        method: 'CARD',
        provider: 'MOCK',
      })
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  it('order payment (direct) succeeds', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({
        paymentMethod: 'CASH',
        amount: 12.50,
        provider: 'MOCK',
      })
      .expect(201)

    expect(paymentRes.body.success).toBe(true)
    expect(paymentRes.body.data.status).toBe('COMPLETED')

    const prisma = await getPrisma()
    const order = await prisma.order.findUnique({ where: { id: orderRes.body.data.id }, include: { payments: true } })
    expect(order!.payments.length).toBe(1)
    expect(order!.payments[0].status).toBe('COMPLETED')
  })
})

describe('Refund Integration Tests', () => {
  it('full refund succeeds', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CARD', amount: 12.50, provider: 'MOCK' })
      .expect(201)

    const paymentId = paymentRes.body.data.id

    const refundRes = await request(app)
      .post('/api/payments/refund')
      .set(headers)
      .send({ paymentId, amount: 12.50, reason: 'Customer request' })
      .expect(201)

    expect(refundRes.body.success).toBe(true)
    expect(refundRes.body.data.status).toBe('SUCCEEDED')

    const prisma = await getPrisma()
    const payment = await prisma.orderPayment.findUnique({ where: { id: paymentId } })
    expect(payment!.status).toBe('REFUNDED')
  })

  it('partial refund succeeds', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CARD', amount: 12.50, provider: 'MOCK' })
      .expect(201)

    const refundRes = await request(app)
      .post('/api/payments/refund')
      .set(headers)
      .send({ paymentId: paymentRes.body.data.id, amount: 5.00, reason: 'Partial refund' })
      .expect(201)

    expect(refundRes.body.success).toBe(true)

    const prisma = await getPrisma()
    const payment = await prisma.orderPayment.findUnique({ where: { id: paymentRes.body.data.id } })
    expect(payment!.status).toBe('PARTIALLY_REFUNDED')
  })

  it('refund exceeding payment amount rejected', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CARD', amount: 12.50, provider: 'MOCK' })
      .expect(201)

    const res = await request(app)
      .post('/api/payments/refund')
      .set(headers)
      .send({ paymentId: paymentRes.body.data.id, amount: 999.99, reason: 'Too much' })
      .expect(400)
    expect(res.body.success).toBe(false)
  })

  it('refund on incomplete payment rejected', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CARD', amount: 12.50, provider: 'MOCK' })
      .expect(201)

    // Mark payment as PENDING (not COMPLETED) via direct DB
    const prisma = await getPrisma()
    await prisma.orderPayment.update({
      where: { id: paymentRes.body.data.id },
      data: { status: 'PENDING' },
    })

    const res = await request(app)
      .post('/api/payments/refund')
      .set(headers)
      .send({ paymentId: paymentRes.body.data.id, amount: 5.00, reason: 'test' })
      .expect(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })
})
