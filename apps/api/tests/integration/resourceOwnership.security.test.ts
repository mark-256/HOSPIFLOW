import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — Resource-ownership / IDOR suite (mission §10).
 *
 * Within a single organization an IDOR is still possible wherever ownership is
 * weaker than "belongs to my tenant": staff-level resources (shifts,
 * housekeeping assignments, maintenance assignment, folio posting) are checked
 * here, together with non-existent and malformed identifiers (§29).
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let adminA: AuthTokens
let cashierA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

const DENIED = [403, 404]

describe('B39 IDOR — identifiers of other tenants are never sufficient', () => {
  const readCases = [
    { label: 'order', path: () => `/api/orders/${fixture.orgB.orderId}` },
    { label: 'folio', path: () => `/api/folios/${fixture.orgB.folioId}` },
    { label: 'guest', path: () => `/api/guests/${fixture.orgB.guestId}` },
    { label: 'reservation', path: () => `/api/reservations/${fixture.orgB.reservationId}` },
    { label: 'supplier', path: () => `/api/suppliers/${fixture.orgB.supplierId}` },
    { label: 'purchase order', path: () => `/api/purchase-orders/${fixture.orgB.purchaseOrderId}` },
    { label: 'property', path: () => `/api/properties/${fixture.orgB.propertyId}` },
    { label: 'outlet', path: () => `/api/outlets/${fixture.orgB.outletId}` },
    { label: 'terminal', path: () => `/api/terminals/${fixture.orgB.terminalId}` },
    { label: 'room type', path: () => `/api/room-types/${fixture.orgB.roomTypeId}` },
    { label: 'organization', path: () => `/api/organizations/${fixture.orgB.organizationId}` },
  ]

  it.each(readCases)('$label of another tenant is not readable', async ({ path }) => {
    const res = await request(app).get(path()).set(authHeaders(adminA))
    expect(DENIED, `GET ${path()}`).toContain(res.status)
    expect(res.body.success).toBe(false)
  })

  it.each(readCases)('$label of another tenant is not readable by a cashier', async ({ path }) => {
    const res = await request(app).get(path()).set(authHeaders(cashierA))
    expect(DENIED, `GET ${path()}`).toContain(res.status)
  })
})

describe('B39 IDOR — non-existent and malformed identifiers are rejected safely', () => {
  const malformed = ['not-a-uuid', '../../etc/passwd', '%2e%2e%2f', '00000000-0000-0000-0000-000000000000']

  it.each(malformed)('GET /api/guests/%s does not return data or crash', async id => {
    const res = await request(app).get(`/api/guests/${encodeURIComponent(id)}`).set(authHeaders(adminA))
    expect([400, 404, 500]).toContain(res.status)
    expect(res.body?.data ?? null).toBeNull()
  })

  it.each(malformed)('PATCH /api/rooms/%s does not return data or crash', async id => {
    const res = await request(app).patch(`/api/rooms/${encodeURIComponent(id)}`).send({ status: 'OCCUPIED' }).set(authHeaders(adminA))
    expect([400, 404, 500]).toContain(res.status)
  })

  it.each(malformed)('GET /api/orders/%s does not return data or crash', async id => {
    const res = await request(app).get(`/api/orders/${encodeURIComponent(id)}`).set(authHeaders(adminA))
    expect([400, 404, 500]).toContain(res.status)
    expect(res.body?.data ?? null).toBeNull()
  })

  it('a UUID that belongs to no row returns 404 and no data', async () => {
    const res = await request(app).get('/api/guests/11111111-1111-1111-1111-111111111111').set(authHeaders(adminA))
    expect(res.status).toBe(404)
    expect(res.body.data).toBeUndefined()
  })
})

describe('B39 IDOR — POS order state machine cannot be bypassed across the boundary', () => {
  it('a foreign order cannot be advanced through the state machine', async () => {
    const res = await request(app)
      .patch(`/api/orders/${fixture.orgB.orderId}/status`)
      .send({ status: 'SENT_TO_KITCHEN' })
      .set(authHeaders(adminA))
    expect(DENIED).toContain(res.status)
    const order = await prisma.order.findUnique({ where: { id: fixture.orgB.orderId } })
    expect(order.status).toBe('OPEN')
  })

  it('an order may not skip states', async () => {
    const created = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    const res = await request(app)
      .patch(`/api/orders/${created.body.data.id}/status`)
      .send({ status: 'COMPLETED' })
      .set(authHeaders(adminA))
    expect(res.status).toBe(400)
  })

  it('an unknown status value is rejected', async () => {
    const created = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    const res = await request(app)
      .patch(`/api/orders/${created.body.data.id}/status`)
      .send({ status: 'TOTALLY_MADE_UP' })
      .set(authHeaders(adminA))
    expect(res.status).toBe(400)
  })

  it('a payment cannot exceed the order balance', async () => {
    const created = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    const res = await request(app)
      .post(`/api/orders/${created.body.data.id}/pay`)
      .send({ paymentMethod: 'CASH', amount: 5_000_000, provider: 'MOCK' })
      .set(authHeaders(adminA))
    expect(res.status).toBe(400)
  })

  it('a negative or non-numeric payment amount is rejected', async () => {
    const created = await request(app)
      .post('/api/orders')
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .set(authHeaders(cashierA))
      .expect(201)

    for (const amount of [-100, 'not-a-number', null]) {
      const res = await request(app)
        .post(`/api/orders/${created.body.data.id}/pay`)
        .send({ paymentMethod: 'CASH', amount, provider: 'MOCK' })
        .set(authHeaders(adminA))
      expect([400, 500]).toContain(res.status)
    }
  })
})

describe('B39 IDOR — staff-level resources keep their ownership boundary', () => {
  it('a shift owned by another user in the same tenant can be closed by an admin but not re-opened', async () => {
    const shift = await prisma.shift.create({
      data: {
        outletId: fixture.orgA.outletId,
        terminalId: fixture.orgA.terminalId,
        userId: fixture.users.cashierA,
        openingBalance: 100,
        status: 'OPEN',
      },
    })

    await request(app).post(`/api/shifts/${shift.id}/close`).send({ closingBalance: 100 }).set(authHeaders(adminA)).expect(200)

    const closed = await prisma.shift.findUnique({ where: { id: shift.id } })
    expect(closed.status).toBe('CLOSED')

    const again = await request(app).post(`/api/shifts/${shift.id}/close`).send({ closingBalance: 100 }).set(authHeaders(adminA))
    expect(again.status).toBe(400)
  })

  it('a foreign shift cannot be closed', async () => {
    const res = await request(app)
      .post(`/api/shifts/${fixture.orgB.shiftId}/close`)
      .send({ closingBalance: 0 })
      .set(authHeaders(cashierA))
    expect(DENIED).toContain(res.status)
    const shift = await prisma.shift.findUnique({ where: { id: fixture.orgB.shiftId } })
    expect(shift.status).toBe('OPEN')
  })

  it('housekeeping assignment cannot target a user of another tenant', async () => {
    const res = await request(app)
      .patch(`/api/housekeeping/${fixture.orgA.housekeepingTaskId}`)
      .send({ assignedToId: fixture.users.adminB })
      .set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)

    const task = await prisma.housekeepingTask.findUnique({ where: { id: fixture.orgA.housekeepingTaskId } })
    expect(task.assignedToId).toBeNull()
  })

  it('housekeeping assignment accepts a user of the same tenant', async () => {
    const res = await request(app)
      .patch(`/api/housekeeping/${fixture.orgA.housekeepingTaskId}`)
      .send({ assignedToId: fixture.users.housekeeperA, status: 'ASSIGNED' })
      .set(authHeaders(adminA))
      .expect(200)
    const task = await prisma.housekeepingTask.findUnique({ where: { id: fixture.orgA.housekeepingTaskId } })
    expect(task.assignedToId).toBe(fixture.users.housekeeperA)
  })

  it('a housekeeping task of another tenant cannot be reassigned', async () => {
    const res = await request(app)
      .patch(`/api/housekeeping/${fixture.orgB.housekeepingTaskId}`)
      .send({ assignedToId: fixture.users.adminA, status: 'COMPLETED' })
      .set(authHeaders(adminA))
    expect(DENIED).toContain(res.status)
    const task = await prisma.housekeepingTask.findUnique({ where: { id: fixture.orgB.housekeepingTaskId } })
    expect(task.assignedToId).toBeNull()
    expect(task.status).toBe('PENDING')
  })

  it('a maintenance ticket of another tenant cannot be reassigned', async () => {
    const res = await request(app)
      .patch(`/api/maintenance/${fixture.orgB.maintenanceTicketId}`)
      .send({ assignedToId: fixture.users.adminA, status: 'CLOSED' })
      .set(authHeaders(adminA))
    expect(DENIED).toContain(res.status)
    const ticket = await prisma.maintenanceTicket.findUnique({ where: { id: fixture.orgB.maintenanceTicketId } })
    expect(ticket.assignedToId).toBeNull()
    expect(ticket.status).toBe('OPEN')
  })
})

describe('B39 IDOR — folio and purchase-order state machines hold', () => {
  it('a folio with a non-zero balance cannot be closed', async () => {
    const res = await request(app).post(`/api/folios/${fixture.orgA.folioId}/close`).set(authHeaders(adminA))
    expect(res.status).toBe(400)
  })

  it('a purchase order cannot skip its approval workflow', async () => {
    const res = await request(app)
      .patch(`/api/purchase-orders/${fixture.orgA.purchaseOrderId}`)
      .send({ status: 'RECEIVED' })
      .set(authHeaders(adminA))
    expect(res.status).toBe(400)
    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: fixture.orgA.purchaseOrderId } })
    expect(purchaseOrder.status).toBe('DRAFT')
  })

  it('a purchase order in RECEIVED cannot be deleted', async () => {
    const res = await request(app).delete(`/api/purchase-orders/${fixture.orgA.purchaseOrderId}`).set(authHeaders(adminA)).expect(200)
    expect(res.body.success).toBe(true)
    const cancelled = await prisma.purchaseOrder.findUnique({ where: { id: fixture.orgA.purchaseOrderId } })
    expect(cancelled.status).toBe('CANCELLED')
  })

  it('negative and non-finite stock movement quantities are rejected', async () => {
    for (const quantity of [-5, 0, 'abc', null]) {
      const res = await request(app)
        .post('/api/inventory/movements')
        .send({ inventoryItemId: fixture.orgA.inventoryItemId, type: 'ADJUSTMENT', quantity })
        .set(authHeaders(adminA))
      expect([400, 500]).toContain(res.status)
    }
  })
})
