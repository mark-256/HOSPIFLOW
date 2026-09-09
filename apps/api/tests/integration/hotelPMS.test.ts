import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'

let app: Express
let seedData: any
let adminTokens: AuthTokens

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
  adminTokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('Hotel PMS Integration Tests', () => {
  it('Full hotel lifecycle: guest → reservation → check-in → folio → charge → payment → checkout → invoice', async () => {
    const headers = authHeaders(adminTokens)

    // 1. Create Guest
    const guestRes = await request(app)
      .post('/api/guests')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice.johnson@testorga.com',
        phone: '+254700000010',
        nationality: 'American',
        idNumber: 'PASS12345',
        idType: 'PASSPORT',
      })
      .expect(201)

    expect(guestRes.body.success).toBe(true)
    const guest = guestRes.body.data
    expect(guest.id).toBeDefined()

    // 2. Create Reservation
    const checkInDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    const resRes = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guest.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room1Id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 2,
        children: 1,
        ratePlanId: seedData.orgA.ratePlanId,
        rate: 120.0,
        source: 'ONLINE',
      })
      .expect(201)

    expect(resRes.body.success).toBe(true)
    const reservation = resRes.body.data
    expect(reservation.confirmationCode).toBeDefined()

    // Verify database state
    const prisma = await getPrisma()
    const dbReservation = await prisma.reservation.findUnique({ where: { id: reservation.id } })
    expect(dbReservation?.status).toBe('PENDING')

    // 3. Confirm reservation (assign room)
    const confirmRes = await request(app)
      .patch(`/api/reservations/${reservation.id}`)
      .set(headers)
      .send({ status: 'CONFIRMED', roomId: seedData.orgA.room1Id })
      .expect(200)
    expect(confirmRes.body.data.status).toBe('CONFIRMED')

    // 4. Check In
    const checkInRes = await request(app)
      .patch(`/api/reservations/${reservation.id}`)
      .set(headers)
      .send({ status: 'CHECKED_IN' })
      .expect(200)
    expect(checkInRes.body.data.status).toBe('CHECKED_IN')
    expect(checkInRes.body.data.checkedInAt).toBeDefined()

    // 5. Create Folio (directly in DB since no API endpoint)
    const folio = await prisma.folio.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        guestId: guest.id,
        reservationId: reservation.id,
        folioNumber: `FOL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        balance: 0,
        totalCharges: 0,
        totalPayments: 0,
        totalRefunds: 0,
        totalDiscount: 0,
        currency: 'KES',
      },
    })
    expect(folio.id).toBeDefined()

    // 6. Add Charge to Folio (room charge)
    const chargeRes = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(headers)
      .send({
        type: 'CHARGE',
        category: 'ROOM',
        description: 'Room charge for 5 nights',
        amount: 600.00,
        sourceType: 'Reservation',
        sourceId: reservation.id,
      })
      .expect(201)
    expect(chargeRes.body.success).toBe(true)

    // Verify folio balance
    const folioAfterCharge = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioAfterCharge!.balance)).toBe(600.00)
    expect(Number(folioAfterCharge!.totalCharges)).toBe(600.00)

    // 7. Payment on Folio
    const paymentRes = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(headers)
      .send({
        type: 'PAYMENT',
        category: 'CASH',
        description: 'Cash payment',
        amount: 600.00,
      })
      .expect(201)
    expect(paymentRes.body.success).toBe(true)

    // Verify folio balance is 0
    const folioAfterPayment = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(folioAfterPayment!.balance)).toBe(0)
    expect(Number(folioAfterPayment!.totalPayments)).toBe(600.00)

    // 8. Checkout
    const checkoutRes = await request(app)
      .patch(`/api/reservations/${reservation.id}`)
      .set(headers)
      .send({ status: 'CHECKED_OUT' })
      .expect(200)
    expect(checkoutRes.body.data.status).toBe('CHECKED_OUT')
    expect(checkoutRes.body.data.checkedOutAt).toBeDefined()

    // 9. Close Folio
    const closeRes = await request(app)
      .post(`/api/folios/${folio.id}/close`)
      .set(headers)
      .expect(200)
    expect(closeRes.body.data.status).toBe('CLOSED')

    // 10. Generate Invoice (verify folio)
    const invoiceRes = await request(app)
      .get(`/api/folios/${folio.id}`)
      .set(headers)
      .expect(200)
    expect(invoiceRes.body.success).toBe(true)
    expect(invoiceRes.body.data.status).toBe('CLOSED')
    expect(invoiceRes.body.data.transactions.length).toBe(2)

    // Verify room is available again
    const room = await prisma.room.findUnique({ where: { id: seedData.orgA.room1Id } })
    expect(room?.status).toBe('AVAILABLE')

    // Verify audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: seedData.orgA.organizationId,
        action: { in: ['RESERVATION_CREATED', 'CHECK_IN', 'CHECK_OUT', 'PAYMENT', 'ORDER_COMPLETED'] },
      },
    })
    expect(auditLogs.length).toBeGreaterThanOrEqual(3)
  })

  it('Reservation cannot be created with overlapping dates for same room', async () => {
    const headers = authHeaders(adminTokens)

    // Create guest
    const guestRes = await request(app)
      .post('/api/guests')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        firstName: 'Overlap',
        lastName: 'Guest',
        email: 'overlap@testorga.com',
        phone: '+254700000050',
      })
      .expect(201)

    // Create first reservation
    const checkInDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)
    const firstRes = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guestRes.body.data.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room1Id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 1,
        rate: 120.0,
        source: 'ONLINE',
      })
      .expect(201)

    // Confirm the first reservation so it blocks the room
    await request(app)
      .patch(`/api/reservations/${firstRes.body.data.id}`)
      .set(headers)
      .send({ status: 'CONFIRMED' })
      .expect(200)

    // Create second overlapping reservation for same room
    const overlapCheckIn = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000)
    const overlapCheckOut = new Date(Date.now() + 27 * 24 * 60 * 60 * 1000)
    const res = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guestRes.body.data.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room1Id,
        checkInDate: overlapCheckIn.toISOString(),
        checkOutDate: overlapCheckOut.toISOString(),
        adults: 1,
        rate: 120.0,
        source: 'ONLINE',
      })
      .expect(400)
    expect(res.body.success).toBe(false)
  })

  it('Reservation with different room and overlapping dates succeeds', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()
    const guest = await prisma.guest.findFirst({ where: { propertyId: seedData.orgA.propertyId } })

    const checkInDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
    const res = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guest!.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room2Id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 1,
        rate: 120.0,
        source: 'ONLINE',
      })
      .expect(201)
    expect(res.body.success).toBe(true)
  })

  it('Reservation without assigned room can be created and room assigned later', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()
    const guest = await prisma.guest.findFirst({ where: { propertyId: seedData.orgA.propertyId } })

    const checkInDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000)

    const res = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guest!.id,
        roomTypeId: seedData.orgA.roomTypeId,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 2,
        rate: 120.0,
        source: 'DIRECT',
      })
      .expect(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.roomId).toBeNull()
  })

  it('Invalid status transition rejected (PENDING -> CHECKED_OUT)', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()
    const guest = await prisma.guest.findFirst({ where: { propertyId: seedData.orgA.propertyId } })

    const checkInDate = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000)
    const resRes = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guest!.id,
        roomTypeId: seedData.orgA.roomTypeId,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        adults: 1,
        rate: 120.0,
      })
      .expect(201)

    const res = await request(app)
      .patch(`/api/reservations/${resRes.body.data.id}`)
      .set(headers)
      .send({ status: 'CHECKED_OUT' })
      .expect(400)
    expect(res.body.success).toBe(false)
  })

  it('Invalid status value rejected', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()
    const guest = await prisma.guest.findFirst({ where: { propertyId: seedData.orgA.propertyId } })

    const checkInDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 65 * 24 * 60 * 60 * 1000)
    const resRes = await request(app)
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

    const res = await request(app)
      .patch(`/api/reservations/${resRes.body.data.id}`)
      .set(headers)
      .send({ status: 'INVALID_STATUS' })
      .expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
