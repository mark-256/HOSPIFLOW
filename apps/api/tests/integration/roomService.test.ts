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

describe('Room Service & Charge Integration Tests', () => {
  it('room charge matches restaurant order total (no double charge)', async () => {
    const adminHeaders = authHeaders(adminTokens)
    const cashierHeaders = authHeaders(cashierTokens)
    const prisma = await getPrisma()

    // 1. Create guest
    const guestRes = await request(app)
      .post('/api/guests')
      .set(adminHeaders)
      .send({
        propertyId: seedData.orgA.propertyId,
        firstName: 'Room',
        lastName: 'Service',
        email: 'roomservice@testorga.com',
        phone: '+254700000030',
      })
      .expect(201)

    const guest = guestRes.body.data

    // 2. Create reservation and check in
    const checkInDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 95 * 24 * 60 * 60 * 1000)
    const resRes = await request(app)
      .post('/api/reservations')
      .set(adminHeaders)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guest.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room1Id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 1,
        rate: 120.0,
      })
      .expect(201)

    const reservation = resRes.body.data

    // Confirm room assignment
    await request(app)
      .patch(`/api/reservations/${reservation.id}`)
      .set(adminHeaders)
      .send({ status: 'CONFIRMED', roomId: seedData.orgA.room1Id })
      .expect(200)

    // Check in
    await request(app)
      .patch(`/api/reservations/${reservation.id}`)
      .set(adminHeaders)
      .send({ status: 'CHECKED_IN' })
      .expect(200)

    // 3. Create folio
    const folio = await prisma.folio.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        guestId: guest.id,
        reservationId: reservation.id,
        folioNumber: `FOL-${Date.now()}-RS`,
        balance: 0,
        totalCharges: 0,
        totalPayments: 0,
        totalRefunds: 0,
        totalDiscount: 0,
        currency: 'KES',
      },
    })

    // 4. Create restaurant order (room service)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(cashierHeaders)
      .send({
        outletId: seedData.orgA.outletId,
        orderType: 'ROOM_SERVICE',
        guestId: guest.id,
        roomNumber: '101',
        covers: 1,
      })
      .expect(201)

    const order = orderRes.body.data

    // 5. Add items
    const itemRes = await request(app)
      .post(`/api/orders/${order.id}/items`)
      .set(cashierHeaders)
      .send({ productId: seedData.orgA.productId, quantity: 2 })
      .expect(201)

    expect(itemRes.body.data.total).toBe('25')

    // 6. Process order through kitchen
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(cashierHeaders)
      .send({ status: 'OPEN' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)))
      .send({ status: 'SENT_TO_KITCHEN' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)))
      .send({ status: 'PREPARING' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)))
      .send({ status: 'READY' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)))
      .send({ status: 'SERVED' })
      .expect(200)

    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set(authHeaders(await login(app, seedData.orgA.users.CHEF.email, seedData.orgA.users.CHEF.password)))
      .send({ status: 'COMPLETED' })
      .expect(200)

    // 7. Charge room: add folio transaction for the order total
    const chargeRes = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(adminHeaders)
      .send({
        type: 'CHARGE',
        category: 'ROOM_SERVICE',
        description: `Room service charge for order ${order.orderNumber}`,
        amount: 25.00,
        reference: order.orderNumber,
        sourceId: order.id,
        sourceType: 'Order',
      })
      .expect(201)

    // Verify folio balance matches order total
    const folioAfter = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioAfter!.balance)).toBe(25.00)
    expect(Number(folioAfter!.totalCharges)).toBe(25.00)

    // 8. Pay the folio
    const payRes = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(adminHeaders)
      .send({
        type: 'PAYMENT',
        category: 'CASH',
        description: 'Room service payment',
        amount: 25.00,
      })
      .expect(201)

    // Verify folio balance is 0 (no double charge)
    const folioAfterPay = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioAfterPay!.balance)).toBe(0)
    expect(Number(folioAfterPay!.totalPayments)).toBe(25.00)

    // Verify no duplicate charges
    const charges = await prisma.folioTransaction.findMany({
      where: { folioId: folio.id, type: 'CHARGE' },
    })
    expect(charges.length).toBe(1)
    expect(Number(charges[0].amount)).toBe(25.00)
  })
})
