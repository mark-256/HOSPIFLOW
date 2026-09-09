import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'

let app: Express
let seedData: any
let cashierTokens: AuthTokens
let waiterTokens: AuthTokens
let chefTokens: AuthTokens

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
  cashierTokens = await login(app, seedData.orgA.users.CASHIER.email, seedData.orgA.users.CASHIER.password)
  waiterTokens = await login(app, seedData.orgA.users.WAITER.email, seedData.orgA.users.WAITER.password)
  chefTokens = await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('POS Integration Tests', () => {
  it('Full POS flow: shift → table → order → items → kitchen → complete → payment → receipt', async () => {
    const headers = authHeaders(waiterTokens)
    const chefHeaders = authHeaders(chefTokens)
    const cashierHeaders = authHeaders(cashierTokens)
    const prisma = await getPrisma()

    // 1. Open shift
    const shiftRes = await request(app)
      .post('/api/shifts/open')
      .set(headers)
      .send({ terminalId: seedData.orgA.terminalId, openingBalance: 0 })
      .expect(201)
    expect(shiftRes.body.success).toBe(true)
    const shift = shiftRes.body.data
    expect(shift.id).toBeDefined()

    // 2. Open table (use existing table)
    const tableRes = await request(app)
      .get('/api/tables')
      .set(headers)
      .query({ outletId: seedData.orgA.outletId })
      .expect(200)
    expect(tableRes.body.data.length).toBeGreaterThan(0)
    const table = tableRes.body.data[0]

    // 3. Create order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({
        outletId: seedData.orgA.outletId,
        tableId: table.id,
        orderType: 'DINE_IN',
        covers: 4,
      })
      .expect(201)
    expect(orderRes.body.success).toBe(true)
    const order = orderRes.body.data

    // 4. Add items
    const itemRes = await request(app)
      .post(`/api/orders/${order.id}/items`)
      .set(headers)
      .send({
        productId: seedData.orgA.productId,
        quantity: 2,
      })
      .expect(201)
    expect(itemRes.body.success).toBe(true)

    // Verify order total updated
    let updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(Number(updatedOrder!.subtotal)).toBe(25.00)
    expect(Number(updatedOrder!.total)).toBe(25.00)
    expect(Number(updatedOrder!.balance)).toBe(25.00)

    // 5. Send to kitchen
    const sentRes = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(chefHeaders)
      .send({ status: 'OPEN' })
      .expect(200)
    expect(sentRes.body.data.status).toBe('OPEN')

    const kitchenRes = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(chefHeaders)
      .send({ status: 'SENT_TO_KITCHEN' })
      .expect(200)
    expect(kitchenRes.body.data.status).toBe('SENT_TO_KITCHEN')

    // 6. Mark preparing
    const preparingRes = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(chefHeaders)
      .send({ status: 'PREPARING' })
      .expect(200)
    expect(preparingRes.body.data.status).toBe('PREPARING')

    // 7. Mark ready
    const readyRes = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(chefHeaders)
      .send({ status: 'READY' })
      .expect(200)
    expect(readyRes.body.data.status).toBe('READY')

    // 8. Mark served
    const servedRes = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(cashierHeaders)
      .send({ status: 'SERVED' })
      .expect(200)
    expect(servedRes.body.data.status).toBe('SERVED')

    // 9. Complete order (triggers inventory deduction)
    const completeRes = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(cashierHeaders)
      .send({ status: 'COMPLETED' })
      .expect(200)
    expect(completeRes.body.data.status).toBe('COMPLETED')
    expect(completeRes.body.data.completedAt).toBeDefined()

    // Verify inventory was deducted
    const inventoryItem = await prisma.inventoryItem.findUnique({
      where: { id: seedData.orgA.inventoryItemId },
      include: { stockMovements: true },
    })
    const salesMovements = inventoryItem!.stockMovements.filter(m => m.type === 'SALE')
    expect(salesMovements.length).toBeGreaterThan(0)

    // 10. Pay for the order
    const paymentRes = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set(cashierHeaders)
      .send({
        paymentMethod: 'CASH',
        amount: 25.00,
        provider: 'MOCK',
      })
      .expect(201)
    expect(paymentRes.body.success).toBe(true)

    // Verify order balance is 0
    updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(Number(updatedOrder!.balance)).toBe(0)
    expect(Number(updatedOrder!.paidAmount)).toBe(25.00)

    // 11. Close shift
    const closeRes = await request(app)
      .post(`/api/shifts/${shift.id}/close`)
      .set(cashierHeaders)
      .send({ closingBalance: 25.00 })
      .expect(200)
    expect(closeRes.body.data.status).toBe('CLOSED')
  })

  it('Order without items cannot be paid (zero balance)', async () => {
    const headers = authHeaders(waiterTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'TAKEAWAY' })
      .expect(201)

    const paymentRes = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CASH', amount: 0, provider: 'MOCK' })

    expect(paymentRes.status).toBeGreaterThanOrEqual(400)
    expect(paymentRes.body.success).toBe(false)
  })

  it('Order transitions follow correct state machine', async () => {
    const headers = authHeaders(waiterTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const order = orderRes.body.data

    // DRAFT -> OPEN
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(headers)
      .send({ status: 'OPEN' })
      .expect(200)

    // OPEN -> DRAFT (invalid)
    const res = await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(headers)
      .send({ status: 'DRAFT' })
      .expect(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })

  it('Order amount exceeds balance rejected', async () => {
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

    const res = await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CASH', amount: 999.99, provider: 'MOCK' })
      .expect(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
    expect(res.body.error.message).toContain('exceeds')
  })
})
