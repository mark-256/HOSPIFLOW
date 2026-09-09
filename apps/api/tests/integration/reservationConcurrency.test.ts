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

describe('Reservation Concurrency Tests', () => {
  it('exactly one reservation succeeds for same room and overlapping dates', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()

    const guest1 = await prisma.guest.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        firstName: 'Concurrent',
        lastName: 'Guest1',
        email: 'concurrent1@testorga.com',
        phone: '+254700000020',
      },
    })

    const guest2 = await prisma.guest.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        firstName: 'Concurrent',
        lastName: 'Guest2',
        email: 'concurrent2@testorga.com',
        phone: '+254700000021',
      },
    })

    const checkInDate = new Date(Date.now() + 70 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)

    const commonPayload = (guestId: string) => ({
      propertyId: seedData.orgA.propertyId,
      guestId,
      roomTypeId: seedData.orgA.roomTypeId,
      roomId: seedData.orgA.room1Id,
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      adults: 1,
      rate: 120.0,
      source: 'ONLINE',
    })

    const [res1, res2] = await Promise.all([
      request(app).post('/api/reservations').set(headers).send(commonPayload(guest1.id)),
      request(app).post('/api/reservations').set(headers).send(commonPayload(guest2.id)),
    ])

    const results = [res1, res2]
    const successes = results.filter(r => r.status === 201)
    const failures = results.filter(r => r.status !== 201)

    expect(successes.length).toBe(1)
    expect(failures.length).toBe(1)
    expect(failures[0].body.success).toBe(false)
    expect(failures[0].body.error.code).toBe('CONFLICT')

    const reservationCount = await prisma.reservation.count({
      where: { roomId: seedData.orgA.room1Id },
    })
    expect(reservationCount).toBe(1)
  })

  it('reservations for different rooms with overlapping dates both succeed', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()

    const guest = await prisma.guest.create({
      data: {
        propertyId: seedData.orgA.propertyId,
        firstName: 'Different',
        lastName: 'Room',
        email: 'diffroom@testorga.com',
        phone: '+254700000022',
      },
    })

    const checkInDate = new Date(Date.now() + 80 * 24 * 60 * 60 * 1000)
    const checkOutDate = new Date(Date.now() + 85 * 24 * 60 * 60 * 1000)

    const payload = {
      propertyId: seedData.orgA.propertyId,
      guestId: guest.id,
      roomTypeId: seedData.orgA.roomTypeId,
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      adults: 1,
      rate: 120.0,
    }

    const res1 = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({ ...payload, roomId: seedData.orgA.room1Id })
      .expect(201)

    const res2 = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({ ...payload, roomId: seedData.orgA.room2Id })
      .expect(201)

    expect(res1.body.success).toBe(true)
    expect(res2.body.success).toBe(true)
  })
})
