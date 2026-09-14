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

describe('Inventory Integration Tests', () => {
  it('inventory deduction on order completion', async () => {
    const headers = authHeaders(cashierTokens)
    const prisma = await getPrisma()

    // Get initial stock
    const movementsBefore = await prisma.stockMovement.findMany({
      where: { inventoryItemId: seedData.orgA.inventoryItemId },
    })
    const initialStock = movementsBefore.reduce((sum, movement) => sum + Number(movement.quantity), 0)

    // Create order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    // Add item
    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    // Complete order (triggers inventory deduction) - transition through full state machine
    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'OPEN' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'SENT_TO_KITCHEN' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'PREPARING' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'READY' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'SERVED' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'COMPLETED' })
      .expect(200)

    // Verify stock movements
    const movements = await prisma.stockMovement.findMany({
      where: { orderId: orderRes.body.data.id },
    })
    expect(movements.length).toBeGreaterThan(0)

    const salesMovements = movements.filter(m => m.type === 'SALE')
    expect(salesMovements.length).toBeGreaterThan(0)
  })

  it('inventory list is tenant isolated', async () => {
    const headersA = authHeaders(adminTokens)
    const orgBAdminTokens = await login(app, seedData.orgB.users.ORG_ADMIN.email, seedData.orgB.users.ORG_ADMIN.password)
    const headersB = authHeaders(orgBAdminTokens)
    const prisma = await getPrisma()

    const resA = await request(app)
      .get('/api/inventory')
      .set(headersA)
      .expect(200)

    const resB = await request(app)
      .get('/api/inventory')
      .set(headersB)
      .expect(200)

    expect(resA.body.data.length).toBeGreaterThan(0)
    expect(resB.body.data.length).toBe(0)

    for (const item of resA.body.data) {
      expect(item.organizationId).toBe(seedData.orgA.organizationId)
    }
  })

  it('inventory creation requires authentication', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .send({ name: 'Test', sku: 'TEST-001', unit: 'pcs' })
      .expect(401)

    expect(res.body.success).toBe(false)
  })

  it('inventory creation succeeds for authenticated user', async () => {
    const headers = authHeaders(adminTokens)
    const res = await request(app)
      .post('/api/inventory')
      .set(headers)
      .send({ name: 'Test Item', sku: 'TEST-001', unit: 'pcs', organizationId: seedData.orgA.organizationId })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('Test Item')
  })

  it('stock movement creation succeeds', async () => {
    const headers = authHeaders(adminTokens)
    const res = await request(app)
      .post('/api/inventory/movements')
      .set(headers)
      .send({
        inventoryItemId: seedData.orgA.inventoryItemId,
        type: 'PURCHASE',
        quantity: 10,
        unitCost: 12.5,
        reference: 'test-movement',
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.type).toBe('PURCHASE')
    expect(Number(res.body.data.quantity)).toBe(10)
  })

  it('inventory items cannot be created for other organizations', async () => {
    const headersA = authHeaders(adminTokens)
    const res = await request(app)
      .post('/api/inventory')
      .set(headersA)
      .send({ name: 'Hack', sku: 'HACK-001', unit: 'pcs', organizationId: seedData.orgB.organizationId })
      .expect(201)

    const prisma = await getPrisma()
    const item = await prisma.inventoryItem.findUnique({ where: { id: res.body.data.id } })
    expect(item!.organizationId).toBe(seedData.orgA.organizationId)
  })

  it('duplicate order completion does not duplicate inventory deduction', async () => {
    const headers = authHeaders(cashierTokens)
    const prisma = await getPrisma()

    // Create order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    // Add item
    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 2 })
      .expect(201)

    // Complete order through state machine
    const statuses = ['OPEN', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']
    for (const status of statuses) {
      await request(app)
        .patch(`/api/orders/${orderRes.body.data.id}/status`)
        .set(headers)
        .send({ status })
        .expect(200)
    }

    // Get stock movements after first completion
    const movementsAfterFirst = await prisma.stockMovement.findMany({
      where: { orderId: orderRes.body.data.id, type: 'SALE' },
    })
    const firstDeductionCount = movementsAfterFirst.length
    expect(firstDeductionCount).toBeGreaterThan(0)

    // Attempt to complete again (should be rejected as invalid transition)
    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(headers)
      .send({ status: 'COMPLETED' })
      .expect(400)

    // Verify no duplicate stock movements created
    const movementsAfterSecond = await prisma.stockMovement.findMany({
      where: { orderId: orderRes.body.data.id, type: 'SALE' },
    })
    expect(movementsAfterSecond.length).toBe(firstDeductionCount)
  })
})
