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

describe('Audit Log Integration Tests', () => {
  it('payment creates audit log entry', async () => {
    const headers = authHeaders(adminTokens)
    const cashierTokens = await login(app, seedData.orgA.users.CASHIER.email, seedData.orgA.users.CASHIER.password)
    const cashierHeaders = authHeaders(cashierTokens)
    const prisma = await getPrisma()

    const orderRes = await request(app)
      .post('/api/orders')
      .set(cashierHeaders)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/items`)
      .set(cashierHeaders)
      .send({ productId: seedData.orgA.productId, quantity: 1 })
      .expect(201)

    const beforeCount = await prisma.auditLog.count({
      where: {
        organizationId: seedData.orgA.organizationId,
        action: 'PAYMENT',
      },
    })

    await request(app)
      .post(`/api/orders/${orderRes.body.data.id}/pay`)
      .set(cashierHeaders)
      .send({ paymentMethod: 'CASH', amount: 12.50, provider: 'MOCK' })
      .expect(201)

    const afterCount = await prisma.auditLog.count({
      where: {
        organizationId: seedData.orgA.organizationId,
        action: 'PAYMENT',
      },
    })
    expect(afterCount).toBe(beforeCount + 1)
  })

   it('reservation creation creates audit log', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()

    const guestRes = await request(app)
      .post('/api/guests')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        firstName: 'AuditLog',
        lastName: 'Test',
        email: 'auditlog@testorga.com',
        phone: '+254700000060',
      })
      .expect(201)

    const res = await request(app)
      .post('/api/reservations')
      .set(headers)
      .send({
        propertyId: seedData.orgA.propertyId,
        guestId: guestRes.body.data.id,
        roomTypeId: seedData.orgA.roomTypeId,
        roomId: seedData.orgA.room1Id,
        checkInDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        checkOutDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString(),
        adults: 1,
        rate: 120.0,
      })
      .expect(201)

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: seedData.orgA.organizationId,
        action: 'RESERVATION_CREATED',
        entityId: res.body.data.id,
      },
    })
    expect(auditLog).toBeDefined()
    expect(auditLog!.userId).toBeDefined()
    expect(auditLog!.createdAt).toBeDefined()
  })

  it('audit logs are tenant isolated', async () => {
    const orgBAdminTokens = await login(app, seedData.orgB.users.ORG_ADMIN.email, seedData.orgB.users.ORG_ADMIN.password)
    const headersB = authHeaders(orgBAdminTokens)
    const prisma = await getPrisma()

    const resA = await request(app)
      .get('/api/folios')
      .set(authHeaders(adminTokens))
      .expect(200)

    // Create a folio transaction for org A
    const folios = resA.body.data
    if (folios.length > 0) {
      const folioId = folios[0].id
      await request(app)
        .post(`/api/folios/${folioId}/transactions`)
        .set(authHeaders(adminTokens))
        .send({ type: 'CHARGE', category: 'TEST', description: 'Audit test', amount: 10 })
        .expect(201)

      const orgAAuditLogs = await prisma.auditLog.findMany({
        where: { organizationId: seedData.orgA.organizationId },
        select: { id: true },
      })

      const orgBAuditLogs = await prisma.auditLog.findMany({
        where: { organizationId: seedData.orgB.organizationId },
        select: { id: true },
      })

      const orgAIds = new Set(orgAAuditLogs.map(a => a.id))
      const orgBIds = new Set(orgBAuditLogs.map(a => a.id))

      expect(orgAIds.size).toBeGreaterThan(0)
      for (const id of orgBIds) {
        expect(orgAIds.has(id)).toBe(false)
      }
    }
  })

  it('sensitive data not logged in audit entries', async () => {
    const prisma = await getPrisma()

    const auditLogs = await prisma.auditLog.findMany({
      where: { organizationId: seedData.orgA.organizationId },
      take: 50,
    })

    for (const log of auditLogs) {
      const logStr = JSON.stringify(log)
      expect(logStr).not.toContain('passwordHash')
      expect(logStr).not.toContain('password')
      expect(logStr).not.toContain('secret')
    }
  })

  it('order status transition creates audit log', async () => {
    const headers = authHeaders(adminTokens)
    const prisma = await getPrisma()
    const cashierTokens = await login(app, seedData.orgA.users.CASHIER.email, seedData.orgA.users.CASHIER.password)
    const cashierHeaders = authHeaders(cashierTokens)

    const orderRes = await request(app)
      .post('/api/orders')
      .set(cashierHeaders)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .patch(`/api/orders/${orderRes.body.data.id}/status`)
      .set(cashierHeaders)
      .send({ status: 'OPEN' })
      .expect(200)

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: seedData.orgA.organizationId,
        action: 'ORDER_MODIFIED',
      },
    })
    expect(auditLog).toBeDefined()
  })
})
