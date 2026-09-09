import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'

let app: Express
let seedData: any

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('RBAC Integration Tests', () => {
  let adminTokens: AuthTokens
  let cashierTokens: AuthTokens
  let chefTokens: AuthTokens
  let waiterTokens: AuthTokens

  beforeAll(async () => {
    adminTokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
    cashierTokens = await login(app, seedData.orgA.users.CASHIER.email, seedData.orgA.users.CASHIER.password)
    chefTokens = await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)
    waiterTokens = await login(app, seedData.orgA.users.WAITER.email, seedData.orgA.users.WAITER.password)
  }, 60000)

  it('Super Admin has all permissions', async () => {
    const res = await request(app)
      .get('/api/organizations')
      .set(authHeaders(adminTokens))
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    const orgA = res.body.data.find((o: any) => o.id === seedData.orgA.organizationId)
    expect(orgA).toBeDefined()
  })

  it('Cashier can create orders', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeaders(cashierTokens))
      .send({
        outletId: seedData.orgA.outletId,
        orderType: 'DINE_IN',
      })
      .expect(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBeDefined()
  })

  it('Cashier can process payments', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeaders(cashierTokens))
      .send({
        outletId: seedData.orgA.outletId,
        orderType: 'DINE_IN',
      })
      .expect(201)

    const order = orderRes.body.data

    await request(app)
      .post(`/api/orders/${order.id}/items`)
      .set(authHeaders(cashierTokens))
      .send({
        productId: seedData.orgA.productId,
        quantity: 2,
      })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set(authHeaders(cashierTokens))
      .send({
        paymentMethod: 'CARD',
        amount: 25.00,
        provider: 'MOCK',
      })
    expect(paymentRes.status).toBe(201)
    expect(paymentRes.body.success).toBe(true)
  })

  it('Cashier cannot manage users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set(authHeaders(cashierTokens))
      .expect(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('Chef can view orders', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeaders(cashierTokens))
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const res = await request(app)
      .get(`/api/orders/${orderRes.body.data.id}`)
      .set(authHeaders(chefTokens))
      .expect(200)
    expect(res.body.success).toBe(true)
  })

  it('Chef cannot create orders', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeaders(chefTokens))
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('Chef can update order status (send to kitchen)', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeaders(waiterTokens))
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const res = await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(authHeaders(chefTokens))
      .send({ status: 'OPEN' })
      .expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('OPEN')
  })

  it('Chef cannot refund payments', async () => {
    const res = await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(chefTokens))
      .send({ paymentId: 'test', amount: 5.00, reason: 'test' })
      .expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('Unauthenticated request to protected route returns 401', async () => {
    const res = await request(app)
      .get('/api/orders')
      .expect(401)
    expect(res.body.success).toBe(false)
  })

  it('Receptionist can create guests', async () => {
    const res = await request(app)
      .post('/api/guests')
      .set(authHeaders(adminTokens))
      .send({
        propertyId: seedData.orgA.propertyId,
        firstName: 'Test',
        lastName: 'Guest',
        email: 'testguest@testorga.com',
        phone: '+254700000003',
      })
      .expect(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBeDefined()
  })

  it('Cashier cannot access finance/backup endpoints', async () => {
    const res = await request(app)
      .post('/api/admin/backups')
      .set(authHeaders(cashierTokens))
      .expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('Org Admin can trigger backup', async () => {
    const res = await request(app)
      .post('/api/admin/backups')
      .set(authHeaders(adminTokens))
      .expect(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('success')
  })
})
