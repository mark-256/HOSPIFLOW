import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — Multi-tenant isolation regression suite (mission §8, §9, §12).
 *
 * Every assertion authenticates as Organization A and reaches for an
 * Organization B identifier (or vice versa). All identifiers come from the
 * fixture that was just created, never from hardcoded rows.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let adminA: AuthTokens
let adminB: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
}, 120000)

afterAll(async () => {
  await disconnect()
})

/** The API's existing convention for a cross-tenant read/write is 404. */
const DENIED = [403, 404]

describe('B39 Tenant isolation — list endpoints never leak the other tenant', () => {
  const listCases: Array<{ path: string; secret: (b: any) => string }> = [
    { path: '/api/rooms', secret: b => b.roomId },
    { path: '/api/guests', secret: b => b.guestId },
    { path: '/api/reservations', secret: b => b.reservationId },
    { path: '/api/folios', secret: b => b.folioId },
    { path: '/api/inventory', secret: b => b.inventoryItemId },
    { path: '/api/inventory/movements', secret: b => b.inventoryItemId },
    { path: '/api/suppliers', secret: b => b.supplierId },
    { path: '/api/purchase-orders', secret: b => b.purchaseOrderId },
    { path: '/api/housekeeping', secret: b => b.housekeepingTaskId },
    { path: '/api/maintenance', secret: b => b.maintenanceTicketId },
    { path: '/api/shifts', secret: b => b.shiftId },
    { path: '/api/orders', secret: b => b.orderId },
    { path: '/api/online-orders', secret: b => b.orderId },
    { path: '/api/tables', secret: b => b.tableId },
    { path: '/api/menus', secret: b => b.menuId },
    { path: '/api/products', secret: b => b.productId },
    { path: '/api/terminals', secret: b => b.terminalId },
    { path: '/api/outlets', secret: b => b.outletId },
    { path: '/api/room-types', secret: b => b.roomTypeId },
    { path: '/api/reports/sales', secret: b => b.orderId },
  ]

  it.each(listCases)('Organization A cannot see Organization B data via $path', async ({ path, secret }) => {
    const secretId = secret(fixture.orgB)
    const res = await request(app).get(path).set(authHeaders(adminA)).expect(200)
    expect(JSON.stringify(res.body)).not.toContain(secretId)
  })

  it.each(listCases)('Organization B cannot see Organization A data via $path', async ({ path, secret }) => {
    const secretId = secret(fixture.orgA)
    const res = await request(app).get(path).set(authHeaders(adminB)).expect(200)
    expect(JSON.stringify(res.body)).not.toContain(secretId)
  })
})

describe('B39 Tenant isolation — client-supplied organizationId cannot widen scope', () => {
  const orgScopedListPaths = [
    '/api/rooms',
    '/api/guests',
    '/api/reservations',
    '/api/folios',
    '/api/inventory',
    '/api/inventory/movements',
    '/api/suppliers',
    '/api/purchase-orders',
    '/api/housekeeping',
    '/api/maintenance',
    '/api/shifts',
    '/api/orders',
    '/api/online-orders',
    '/api/tables',
    '/api/menus',
    '/api/products',
    '/api/terminals',
    '/api/outlets',
    '/api/room-types',
    '/api/reports/sales',
    '/api/reports/occupancy',
  ]

  it.each(orgScopedListPaths)('?organizationId=<B> is ignored on $path', async path => {
    const res = await request(app)
      .get(path)
      .query({ organizationId: fixture.orgB.organizationId, limit: 200, propertyId: fixture.orgB.propertyId })
      .set(authHeaders(adminA))
      .expect(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain(fixture.orgB.organizationId)
    expect(body).not.toContain(fixture.orgB.guestId)
    expect(body).not.toContain(fixture.orgB.orderId)
    expect(body).not.toContain(fixture.orgB.inventoryItemId)
  })
})

describe('B39 Tenant isolation — B37.2 inventory regression must not regress', () => {
  it('GET /api/inventory is scoped to the authenticated organization', async () => {
    const res = await request(app).get('/api/inventory').set(authHeaders(adminA)).expect(200)
    expect(res.body.data.every((i: any) => i.organizationId === fixture.orgA.organizationId)).toBe(true)
    expect(res.body.data.some((i: any) => i.id === fixture.orgB.inventoryItemId)).toBe(false)
  })

  it('GET /api/inventory/movements is scoped to the authenticated organization', async () => {
    await prisma.stockMovement.create({
      data: { inventoryItemId: fixture.orgB.inventoryItemId, type: 'PURCHASE', quantity: 4242, unitCost: 99.99, reference: 'b39-org-b-secret' },
    })
    const res = await request(app).get('/api/inventory/movements').set(authHeaders(adminA)).expect(200)
    expect(JSON.stringify(res.body)).not.toContain('b39-org-b-secret')
  })

  it('POST /api/inventory cannot create an item for another organization', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set(authHeaders(adminA))
      .send({ name: 'Cross Tenant', sku: 'B39-XTENANT', unit: 'pcs', organizationId: fixture.orgB.organizationId })
      .expect(201)
    const created = await prisma.inventoryItem.findUnique({ where: { id: res.body.data.id } })
    expect(created.organizationId).toBe(fixture.orgA.organizationId)
  })

  it('POST /api/inventory/movements cannot target another tenant inventory item', async () => {
    const res = await request(app)
      .post('/api/inventory/movements')
      .set(authHeaders(adminA))
      .send({ inventoryItemId: fixture.orgB.inventoryItemId, type: 'ADJUSTMENT', quantity: 5 })
    expect(DENIED).toContain(res.status)

    const movements = await prisma.stockMovement.findMany({ where: { inventoryItemId: fixture.orgB.inventoryItemId, type: 'ADJUSTMENT' } })
    expect(movements).toHaveLength(0)
  })

  it('a purchase order cannot reference another tenant inventory item', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set(authHeaders(adminA))
      .send({
        supplierId: fixture.orgA.supplierId,
        items: [{ inventoryItemId: fixture.orgB.inventoryItemId, quantity: 1, unitCost: 1 }],
      })
    expect(res.status).toBe(400)
  })
})

describe('B39 Tenant isolation — cross-tenant resource access is denied', () => {
  const idorCases: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: (b: any) => string; body?: any }> = [
    { method: 'get', path: b => `/api/properties/${b.propertyId}` },
    { method: 'patch', path: b => `/api/properties/${b.propertyId}`, body: { name: 'hijacked' } },
    { method: 'get', path: b => `/api/outlets/${b.outletId}` },
    { method: 'patch', path: b => `/api/outlets/${b.outletId}`, body: { name: 'hijacked' } },
    { method: 'delete', path: b => `/api/outlets/${b.outletId}` },
    { method: 'get', path: b => `/api/terminals/${b.terminalId}` },
    { method: 'patch', path: b => `/api/terminals/${b.terminalId}`, body: { name: 'hijacked' } },
    { method: 'delete', path: b => `/api/terminals/${b.terminalId}` },
    { method: 'get', path: b => `/api/room-types/${b.roomTypeId}` },
    { method: 'patch', path: b => `/api/room-types/${b.roomTypeId}`, body: { name: 'hijacked' } },
    { method: 'delete', path: b => `/api/room-types/${b.roomTypeId}` },
    { method: 'get', path: b => `/api/guests/${b.guestId}` },
    { method: 'patch', path: b => `/api/guests/${b.guestId}`, body: { firstName: 'hijacked' } },
    { method: 'get', path: b => `/api/reservations/${b.reservationId}` },
    { method: 'patch', path: b => `/api/reservations/${b.reservationId}`, body: { status: 'CANCELLED' } },
    { method: 'get', path: b => `/api/folios/${b.folioId}` },
    { method: 'post', path: b => `/api/folios/${b.folioId}/transactions`, body: { type: 'PAYMENT', category: 'X', description: 'x', amount: 10 } },
    { method: 'post', path: b => `/api/folios/${b.folioId}/close` },
    { method: 'get', path: b => `/api/suppliers/${b.supplierId}` },
    { method: 'patch', path: b => `/api/suppliers/${b.supplierId}`, body: { name: 'hijacked' } },
    { method: 'delete', path: b => `/api/suppliers/${b.supplierId}` },
    { method: 'get', path: b => `/api/purchase-orders/${b.purchaseOrderId}` },
    { method: 'patch', path: b => `/api/purchase-orders/${b.purchaseOrderId}`, body: { status: 'APPROVED' } },
    { method: 'delete', path: b => `/api/purchase-orders/${b.purchaseOrderId}` },
    { method: 'get', path: b => `/api/orders/${b.orderId}` },
    { method: 'patch', path: b => `/api/orders/${b.orderId}/status`, body: { status: 'OPEN' } },
    { method: 'post', path: b => `/api/orders/${b.orderId}/items`, body: { productId: 'x', quantity: 1 } },
    { method: 'post', path: b => `/api/orders/${b.orderId}/pay`, body: { paymentMethod: 'CASH', amount: 1 } },
    { method: 'patch', path: b => `/api/housekeeping/${b.housekeepingTaskId}`, body: { status: 'COMPLETED' } },
    { method: 'patch', path: b => `/api/maintenance/${b.maintenanceTicketId}`, body: { status: 'RESOLVED' } },
    { method: 'post', path: b => `/api/shifts/${b.shiftId}/close`, body: { closingBalance: 0 } },
    { method: 'get', path: b => `/api/organizations/${b.organizationId}` },
    { method: 'patch', path: b => `/api/organizations/${b.organizationId}`, body: { name: 'hijacked' } },
  ]

  it.each(idorCases)('Organization A is denied $method $path (Organization B resource)', async ({ method, path, body }) => {
    const res = await (request(app) as any)[method](path(fixture.orgB)).set(authHeaders(adminA)).send(body)
    expect(DENIED).toContain(res.status)
    expect(res.body.success).toBe(false)
  })

  it.each(idorCases)('Organization B is denied $method $path (Organization A resource)', async ({ method, path, body }) => {
    const res = await (request(app) as any)[method](path(fixture.orgA)).set(authHeaders(adminB)).send(body)
    expect(DENIED).toContain(res.status)
    expect(res.body.success).toBe(false)
  })
})

describe('B39 Tenant isolation — cross-tenant data was not mutated', () => {
  it('Organization B property, outlet, terminal and room type are untouched', async () => {
    const property = await prisma.property.findUnique({ where: { id: fixture.orgB.propertyId } })
    const outlet = await prisma.outlet.findUnique({ where: { id: fixture.orgB.outletId } })
    const terminal = await prisma.terminal.findUnique({ where: { id: fixture.orgB.terminalId } })
    const roomType = await prisma.roomType.findUnique({ where: { id: fixture.orgB.roomTypeId } })
    const organization = await prisma.organization.findUnique({ where: { id: fixture.orgB.organizationId } })
    expect(property.name).not.toBe('hijacked')
    expect(outlet.name).not.toBe('hijacked')
    expect(terminal.name).not.toBe('hijacked')
    expect(roomType.name).not.toBe('hijacked')
    expect(organization.name).not.toBe('hijacked')
    expect(organization.status).toBe('ACTIVE')
  })

  it('Organization B guest, folio, reservation, order, PO and shift are untouched', async () => {
    const guest = await prisma.guest.findUnique({ where: { id: fixture.orgB.guestId } })
    const folio = await prisma.folio.findUnique({ where: { id: fixture.orgB.folioId } })
    const reservation = await prisma.reservation.findUnique({ where: { id: fixture.orgB.reservationId } })
    const order = await prisma.order.findUnique({ where: { id: fixture.orgB.orderId } })
    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: fixture.orgB.purchaseOrderId } })
    const shift = await prisma.shift.findUnique({ where: { id: fixture.orgB.shiftId } })
    const supplier = await prisma.supplier.findUnique({ where: { id: fixture.orgB.supplierId } })

    expect(guest.firstName).toBe('ORGB')
    expect(Number(folio.balance)).toBe(500)
    expect(reservation.status).toBe('CONFIRMED')
    expect(order.status).toBe('OPEN')
    expect(purchaseOrder.status).toBe('DRAFT')
    expect(shift.status).toBe('OPEN')
    expect(supplier.name).toContain('ORGB')
  })

  it('Organization B housekeeping and maintenance records are untouched', async () => {
    const task = await prisma.housekeepingTask.findUnique({ where: { id: fixture.orgB.housekeepingTaskId } })
    const ticket = await prisma.maintenanceTicket.findUnique({ where: { id: fixture.orgB.maintenanceTicketId } })
    expect(task.status).toBe('PENDING')
    expect(ticket.status).toBe('OPEN')
  })
})

describe('B39 Tenant isolation — nested relationships cannot be mixed across tenants', () => {
  it('cannot create a reservation in Organization A with an Organization B guest', async () => {
    const res = await request(app).post('/api/reservations').set(authHeaders(adminA)).send({
      propertyId: fixture.orgA.propertyId,
      guestId: fixture.orgB.guestId,
      roomTypeId: fixture.orgA.roomTypeId,
      checkInDate: new Date(Date.now() + 86400000).toISOString(),
      checkOutDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      adults: 1,
    })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a reservation in Organization A with an Organization B room type', async () => {
    const res = await request(app).post('/api/reservations').set(authHeaders(adminA)).send({
      propertyId: fixture.orgA.propertyId,
      guestId: fixture.orgA.guestId,
      roomTypeId: fixture.orgB.roomTypeId,
      checkInDate: new Date(Date.now() + 86400000).toISOString(),
      checkOutDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      adults: 1,
    })
    expect(DENIED).toContain(res.status)
  })

  it('cannot check a reservation into an Organization B room', async () => {
    const res = await request(app)
      .patch(`/api/reservations/${fixture.orgA.reservationId}`)
      .set(authHeaders(adminA))
      .send({ status: 'CHECKED_IN', roomId: fixture.orgB.roomId })
    expect(DENIED).toContain(res.status)
    const reservation = await prisma.reservation.findUnique({ where: { id: fixture.orgA.reservationId } })
    expect(reservation.roomId).toBe(fixture.orgA.roomId)
  })

  it('cannot create an order in Organization A on an Organization B table', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeaders(adminA))
      .send({ outletId: fixture.orgA.outletId, tableId: fixture.orgB.tableId, orderType: 'DINE_IN' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create an order in Organization A for an Organization B guest', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(authHeaders(adminA))
      .send({ outletId: fixture.orgA.outletId, guestId: fixture.orgB.guestId, orderType: 'DINE_IN' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot add an Organization B product to an Organization A order', async () => {
    const res = await request(app)
      .post(`/api/orders/${fixture.orgA.orderId}/items`)
      .set(authHeaders(adminA))
      .send({ productId: fixture.orgB.productId, quantity: 1 })
    expect(DENIED).toContain(res.status)
    const items = await prisma.orderItem.findMany({ where: { orderId: fixture.orgA.orderId } })
    expect(items.every((i: any) => i.productId !== fixture.orgB.productId)).toBe(true)
  })

  it('cannot open a shift on an Organization B terminal', async () => {
    const res = await request(app)
      .post('/api/shifts/open')
      .set(authHeaders(adminA))
      .send({ terminalId: fixture.orgB.terminalId, openingBalance: 0 })
    expect(DENIED).toContain(res.status)
    const shifts = await prisma.shift.findMany({ where: { terminalId: fixture.orgB.terminalId, userId: fixture.users.adminA } })
    expect(shifts).toHaveLength(0)
  })

  it('cannot create a housekeeping task against an Organization B property/room', async () => {
    const res = await request(app)
      .post('/api/housekeeping')
      .set(authHeaders(adminA))
      .send({ propertyId: fixture.orgB.propertyId, roomId: fixture.orgB.roomId, type: 'TURNDOWN' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a housekeeping task in an Organization A property using an Organization B room', async () => {
    const res = await request(app)
      .post('/api/housekeeping')
      .set(authHeaders(adminA))
      .send({ propertyId: fixture.orgA.propertyId, roomId: fixture.orgB.roomId, type: 'TURNDOWN' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a maintenance ticket against an Organization B property', async () => {
    const res = await request(app)
      .post('/api/maintenance')
      .set(authHeaders(adminA))
      .send({ propertyId: fixture.orgB.propertyId, title: 'x', description: 'y' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a menu in an Organization B outlet', async () => {
    const res = await request(app)
      .post('/api/menus')
      .set(authHeaders(adminA))
      .send({ outletId: fixture.orgB.outletId, name: 'x', code: 'B39-XMENU' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a product in an Organization B menu category', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(authHeaders(adminA))
      .send({ menuCategoryId: fixture.orgB.categoryId, name: 'x', code: 'B39-XPROD', price: 10 })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a table in an Organization B outlet', async () => {
    const res = await request(app)
      .post('/api/tables')
      .set(authHeaders(adminA))
      .send({ outletId: fixture.orgB.outletId, name: 'x', code: 'B39-XTABLE', capacity: 2 })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a terminal in an Organization B outlet', async () => {
    const res = await request(app)
      .post('/api/terminals')
      .set(authHeaders(adminA))
      .send({ outletId: fixture.orgB.outletId, name: 'x', code: 'B39-XTERM' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a room in an Organization B property', async () => {
    const res = await request(app)
      .post('/api/rooms')
      .set(authHeaders(adminA))
      .send({ propertyId: fixture.orgB.propertyId, roomTypeId: fixture.orgB.roomTypeId, roomNumber: 'B39-X' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a guest in an Organization B property', async () => {
    const res = await request(app)
      .post('/api/guests')
      .set(authHeaders(adminA))
      .send({ propertyId: fixture.orgB.propertyId, firstName: 'X', lastName: 'Y' })
    expect(DENIED).toContain(res.status)
  })

  it('cannot create a supplier in an Organization B context', async () => {
    const res = await request(app)
      .post('/api/suppliers')
      .set(authHeaders(adminA))
      .send({ name: 'X', code: 'B39-XSUP', organizationId: fixture.orgB.organizationId })
      .expect(201)
    const created = await prisma.supplier.findUnique({ where: { id: res.body.data.id } })
    expect(created.organizationId).toBe(fixture.orgA.organizationId)
  })

  it('cannot create an online order in an Organization B outlet', async () => {
    const res = await request(app).post('/api/online-orders').set(authHeaders(adminA)).send({
      outletId: fixture.orgB.outletId,
      customerName: 'X',
      customerPhone: '+254700000111',
      items: [{ productId: fixture.orgB.productId, quantity: 1 }],
    })
    expect(DENIED).toContain(res.status)
  })

  it('cannot order an Organization B product through an Organization A outlet', async () => {
    const res = await request(app).post('/api/online-orders').set(authHeaders(adminA)).send({
      outletId: fixture.orgA.outletId,
      customerName: 'X',
      customerPhone: '+254700000112',
      items: [{ productId: fixture.orgB.productId, quantity: 1 }],
    })
    expect(res.status).toBe(400)
  })

  it('cannot read another tenant loyalty account', async () => {
    const res = await request(app)
      .get('/api/loyalty/account')
      .query({ guestId: fixture.orgB.guestId })
      .set(authHeaders(adminA))
    expect(DENIED).toContain(res.status)
  })

  it('cannot award loyalty points to another tenant guest', async () => {
    const res = await request(app)
      .post('/api/loyalty/points')
      .set(authHeaders(adminA))
      .send({ guestId: fixture.orgB.guestId, points: 1000, reason: 'attack' })
    expect(DENIED).toContain(res.status)
    const account = await prisma.loyaltyAccount.findUnique({ where: { id: fixture.orgB.loyaltyAccountId } })
    expect(Number(account.points)).toBe(500)
  })

  it('cannot read another tenant guest portal reservations', async () => {
    const res = await request(app)
      .get('/api/guest-portal/reservations')
      .query({ guestId: fixture.orgB.guestId })
      .set(authHeaders(adminA))
    expect(DENIED).toContain(res.status)
  })

  it('cannot read another tenant guest portal folios', async () => {
    const res = await request(app)
      .get('/api/guest-portal/folios')
      .query({ guestId: fixture.orgB.guestId })
      .set(authHeaders(adminA))
    expect(DENIED).toContain(res.status)
  })

  it('AI insights never include another tenant identifiers', async () => {
    const res = await request(app).get('/api/ai/insights').set(authHeaders(adminA)).expect(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain(fixture.orgB.guestId)
    expect(body).not.toContain(fixture.orgB.inventoryItemId)
  })
})

describe('B39 Tenant isolation — QR generation is tenant scoped', () => {
  it('cannot regenerate the QR token of an Organization B table', async () => {
    const before = await prisma.table.findUnique({ where: { id: fixture.orgB.tableId } })
    const res = await request(app).post('/api/qr/generate').set(authHeaders(adminA)).send({ tableId: fixture.orgB.tableId })
    expect(DENIED).toContain(res.status)
    const after = await prisma.table.findUnique({ where: { id: fixture.orgB.tableId } })
    expect(after.qrCode).toBe(before.qrCode)
  })

  it('can regenerate the QR token of an Organization A table', async () => {
    const res = await request(app).post('/api/qr/generate').set(authHeaders(adminA)).send({ tableId: fixture.orgA.tableId }).expect(200)
    expect(res.body.data.token).toBeTruthy()
    const table = await prisma.table.findUnique({ where: { id: fixture.orgA.tableId } })
    expect(table.qrCode).toBe(res.body.data.token)
  })
})
