import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'
import { PrismaClient } from '@hospiflow/database'

let app: Express
let seedData: any
let adminTokens: AuthTokens
let prisma: PrismaClient

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
  adminTokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
  prisma = await getPrisma()
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('Database Transaction Tests', () => {
  it('reservation creation fails atomically with nonexistent property', async () => {
    const headers = authHeaders(adminTokens)

    const guest = await prisma.guest.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        firstName: 'Transaction',
        lastName: 'Test',
        email: 'txntest@testorga.com',
        phone: '+254700000040',
      },
    })

    const countBefore = await prisma.reservation.count()

    const res = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: 'nonexistent-property-id',
        guestId: guest.id,
        roomTypeId: seedData.orgA.roomTypeId,
        checkInDate: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
        checkOutDate: new Date(Date.now() + 105 * 24 * 60 * 60 * 1000).toISOString(),
        adults: 1,
        rate: 120.0,
      })

    expect(res.status).toBe(404)
    const countAfter = await prisma.reservation.count()
    expect(countAfter).toBe(countBefore)
  })

  it('order pay is atomic — payment and order balance stay consistent', async () => {
    const headers = authHeaders(adminTokens)

    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const orderId = orderRes.body.data.id

    await request(app)
      .post(`/api/orders/${orderId}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderId}/pay`)
      .set(headers)
      .send({ paymentMethod: 'CASH', amount: 12.50, provider: 'MOCK' })
      .expect(201)

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    })
    expect(order!.payments.length).toBe(1)
    expect(Number(order!.paidAmount)).toBe(12.50)
    expect(Number(order!.balance)).toBe(0)
  })

  it('order completion triggers inventory deduction', async () => {
    const headers = authHeaders(adminTokens)

    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const orderId = orderRes.body.data.id

    await request(app)
      .post(`/api/orders/${orderId}/items`)
      .set(headers)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const movementsBefore = await prisma.stockMovement.count()

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(headers)
      .send({ status: 'OPEN' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(headers)
      .send({ status: 'SENT_TO_KITCHEN' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(headers)
      .send({ status: 'PREPARING' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(headers)
      .send({ status: 'READY' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(headers)
      .send({ status: 'SERVED' })
      .expect(200)

    const completeRes = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set(headers)
      .send({ status: 'COMPLETED' })
      .expect(200)

    expect(completeRes.body.data.status).toBe('COMPLETED')

    const movementsAfter = await prisma.stockMovement.count()
    expect(movementsAfter).toBeGreaterThan(movementsBefore)

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    expect(order!.status).toBe('COMPLETED')
  })

  it('folio balance math is consistent after multiple transactions', async () => {
    const headers = authHeaders(adminTokens)

    const guest = await prisma.guest.findFirst({ where: { propertyId: seedData.orgA.propertyId } })
    const checkInDate = new Date(Date.now() + 80 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 83 * 24 * 60 * 60 * 1000)
    const reservationRes = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guest!.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room1Id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 1,
        rate: 120.0,
      })
      .expect(201)

    const reservationId = reservationRes.body.data.id

    const folio = await prisma.folio.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        guestId: guest!.id,
        reservationId: reservationId,
        folioNumber: `FOL-${Date.now()}-TX`,
        balance: 0,
        totalCharges: 0,
        totalPayments: 0,
        totalRefunds: 0,
        totalDiscount: 0,
        currency: 'KES',
      },
    })

    await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(headers)
      .send({ type: 'CHARGE', category: 'ROOM', description: 'Charge 1', amount: 100 })
      .expect(201)

    await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(headers)
      .send({ type: 'CHARGE', category: 'MINIBAR', description: 'Charge 2', amount: 50 })
      .expect(201)

    let folioState = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioState!.balance)).toBe(150)
    expect(Number(folioState!.totalCharges)).toBe(150)

    await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(headers)
      .send({ type: 'PAYMENT', category: 'CASH', description: 'Payment', amount: 100 })
      .expect(201)

    folioState = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioState!.balance)).toBe(50)
    expect(Number(folioState!.totalPayments)).toBe(100)

    await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(headers)
      .send({ type: 'DISCOUNT', category: 'PROMO', description: 'Discount', amount: 5 })
      .expect(201)

    folioState = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioState!.balance)).toBe(45)
    expect(Number(folioState!.totalDiscount)).toBe(5)

    const charges = Number(folioState!.totalCharges)
    const discounts = Number(folioState!.totalDiscount)
    const payments = Number(folioState!.totalPayments)
    const refunds = Number(folioState!.totalRefunds)
    const expectedBalance = Math.round((charges - discounts - payments + refunds) * 100) / 100
    expect(Number(folioState!.balance)).toBe(expectedBalance)
  })
})
