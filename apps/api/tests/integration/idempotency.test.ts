import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { calculateTaxes } from '../../src/services/taxEngine'
import { calculateDiscount } from '../../src/services/discountEngine'
import { Prisma } from '@hospiflow/database'
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

describe('Idempotency Integration Tests', () => {
  it('duplicate order creation with same idempotency key returns same order', async () => {
    const headers = authHeaders(cashierTokens)
    const idempotencyKey = 'order-create-001'
    const orderData = {
      outletId: seedData.orgA.outletId,
      orderType: 'DINE_IN',
    }

    const first = await request(app)
      .post('/api/orders')
      .set(headers)
      .set('Idempotency-Key', idempotencyKey)
      .send(orderData)

    const second = await request(app)
      .post('/api/orders')
      .set(headers)
      .set('Idempotency-Key', idempotencyKey)
      .send(orderData)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.meta.deduplicated).toBe(true)
    expect(first.body.data.id).toBe(second.body.data.id)

    const prisma = await getPrisma()
    const count = await prisma.order.count({ where: { orderNumber: first.body.data.orderNumber } })
    expect(count).toBe(1)
  })

  it('duplicate order pay request with same idempotency key is deduplicated', async () => {
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

    const payData = { paymentMethod: 'CASH', amount: 12.50, provider: 'MOCK' }
    const idempotencyKey = 'pay-idempotent-001'

    const first = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .set('Idempotency-Key', idempotencyKey)
      .send(payData)
      .expect(201)

    const second = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .set('Idempotency-Key', idempotencyKey)
      .send(payData)
      .expect(200)

    expect(second.body.meta.deduplicated).toBe(true)
    expect(first.body.data.id).toBe(second.body.data.id)

    const prisma = await getPrisma()
    const paymentCount = await prisma.orderPayment.count({ where: { orderId: orderRes.body.data.id, reference: idempotencyKey } })
    expect(paymentCount).toBe(1)
  })

  it('different idempotency keys produce different orders', async () => {
    const headers = authHeaders(cashierTokens)
    const order1 = await request(app)
      .post('/api/orders')
      .set(headers)
      .set('Idempotency-Key', 'order-aaa')
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const order2 = await request(app)
      .post('/api/orders')
      .set(headers)
      .set('Idempotency-Key', 'order-bbb')
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    expect(order1.body.data.id).not.toBe(order2.body.data.id)
  })

  it('idempotency on payment service verify does not duplicate', async () => {
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
        idempotencyKey: 'verify-idempotent-001',
      })
      .expect(201)

    const prisma = await getPrisma()
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: orderRes.body.data.id } })

    // Verify twice
    const verify1 = await request(app)
      .post('/api/payments/verify')
      .set(headers)
      .send({ paymentId: payment!.id })
      .expect(200)

    const verify2 = await request(app)
      .post('/api/payments/verify')
      .set(headers)
      .send({ paymentId: payment!.id })
      .expect(200)

    expect(verify1.body.data.status).toBe(verify2.body.data.status)

    const refunds = await prisma.refund.findMany({ where: { paymentId: payment!.id } })
    expect(refunds.length).toBe(0)
  })

  it('financial calculation idempotency: repeated calculations are deterministic', async () => {
    const permissions = ['orders_create', 'orders_edit', 'orders_discount']
    const subtotal = 99.99
    const taxResult = await calculateTaxes({
      subtotal,
      taxRules: [{ id: '1', organizationId: seedData.orgA.organizationId, name: 'VAT', type: 'VAT', rate: new Prisma.Decimal('0.16'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() }],
    })

    const discountInput = {
      type: 'PERCENTAGE' as const,
      value: 10,
    }

    const discountResult = calculateDiscount(taxResult.grandTotal, discountInput, 'CASHIER', permissions)

    // Recalculate
    const taxResult2 = await calculateTaxes({
      subtotal,
      taxRules: [{ id: '1', organizationId: seedData.orgA.organizationId, name: 'VAT', type: 'VAT', rate: new Prisma.Decimal('0.16'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() }],
    })

    const discountResult2 = calculateDiscount(taxResult2.grandTotal, discountInput, 'CASHIER', permissions)

    expect(taxResult.grandTotal).toBe(taxResult2.grandTotal)
    expect(taxResult.totalTax).toBe(taxResult2.totalTax)
    expect(discountResult.finalAmount).toBe(discountResult2.finalAmount)
    expect(discountResult.discountAmount).toBe(discountResult2.discountAmount)
  })
})
