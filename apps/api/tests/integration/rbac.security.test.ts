import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — RBAC / permission-boundary suite (mission §7).
 *
 * Asserts the permission model the architecture already defines: an authorized
 * role succeeds, an unrelated role is refused, and a role from another
 * organization never inherits permissions inside this one. The permission
 * middleware runs before the controller, so the denial path only needs a
 * syntactically valid route; the success path uses real fixture identifiers.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any

const tokens: Partial<Record<string, AuthTokens>> = {}

async function tokenFor(key: string): Promise<AuthTokens> {
  if (!tokens[key]) {
    tokens[key] = await login(
      app,
      fixture.emails[key as keyof typeof fixture.emails],
      fixture.passwords[key as keyof typeof fixture.passwords]
    )
  }
  return tokens[key]!
}

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
}, 120000)

afterAll(async () => {
  await disconnect()
})

interface PermissionCase {
  label: string
  method: 'get' | 'post' | 'patch'
  denyPath: string
  allowPath: (f: SecurityFixture) => string
  allowBody?: (f: SecurityFixture, key: string) => any
  allowed: string[]
  denied: string[]
}

const nextDay = () => new Date(Date.now() + 40 * 86400000).toISOString()
const nextWeek = () => new Date(Date.now() + 42 * 86400000).toISOString()

const PERMISSION_CASES: PermissionCase[] = [
  {
    label: 'housekeeping list',
    method: 'get',
    denyPath: '/api/housekeeping',
    allowPath: () => '/api/housekeeping',
    allowed: ['housekeeperA', 'adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  {
    label: 'housekeeping create',
    method: 'post',
    denyPath: '/api/housekeeping',
    allowPath: () => '/api/housekeeping',
    allowBody: f => ({ propertyId: f.orgA.propertyId, roomId: f.orgA.roomId, type: 'TURNDOWN' }),
    allowed: ['housekeeperA', 'adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  {
    label: 'housekeeping update',
    method: 'patch',
    denyPath: '/api/housekeeping/some-id',
    allowPath: f => `/api/housekeeping/${f.orgA.housekeepingTaskId}`,
    allowBody: () => ({ status: 'IN_PROGRESS' }),
    allowed: ['housekeeperA', 'adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  { label: 'maintenance list', method: 'get', denyPath: '/api/maintenance', allowPath: () => '/api/maintenance', allowed: ['adminA'], denied: ['cashierA', 'restrictedA'] },
  {
    label: 'maintenance create',
    method: 'post',
    denyPath: '/api/maintenance',
    allowPath: () => '/api/maintenance',
    allowBody: f => ({ propertyId: f.orgA.propertyId, title: 'RBAC', description: 'RBAC ticket' }),
    allowed: ['adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  {
    label: 'maintenance update',
    method: 'patch',
    denyPath: '/api/maintenance/some-id',
    allowPath: f => `/api/maintenance/${f.orgA.maintenanceTicketId}`,
    allowBody: () => ({ status: 'IN_PROGRESS' }),
    allowed: ['adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  { label: 'inventory list', method: 'get', denyPath: '/api/inventory', allowPath: () => '/api/inventory', allowed: ['storekeeperA', 'adminA'], denied: ['restrictedA'] },
  { label: 'inventory movements', method: 'get', denyPath: '/api/inventory/movements', allowPath: () => '/api/inventory/movements', allowed: ['storekeeperA', 'adminA'], denied: ['restrictedA'] },
  {
    label: 'inventory adjust',
    method: 'post',
    denyPath: '/api/inventory/movements',
    allowPath: () => '/api/inventory/movements',
    allowBody: f => ({ inventoryItemId: f.orgA.inventoryItemId, type: 'ADJUSTMENT', quantity: 1 }),
    allowed: ['storekeeperA', 'adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  { label: 'folio list', method: 'get', denyPath: '/api/folios', allowPath: () => '/api/folios', allowed: ['receptionistA', 'adminA'], denied: ['restrictedA'] },
  { label: 'folio read', method: 'get', denyPath: '/api/folios/some-id', allowPath: f => `/api/folios/${f.orgA.folioId}`, allowed: ['receptionistA', 'adminA'], denied: ['restrictedA'] },
  {
    label: 'folio transaction',
    method: 'post',
    denyPath: '/api/folios/some-id/transactions',
    allowPath: f => `/api/folios/${f.orgA.folioId}/transactions`,
    allowBody: () => ({ type: 'PAYMENT', category: 'CASH', description: 'RBAC payment', amount: 1 }),
    allowed: ['receptionistA', 'adminA'],
    denied: ['chefA', 'restrictedA'],
  },
  {
    label: 'folio close',
    method: 'post',
    denyPath: '/api/folios/some-id/close',
    allowPath: f => `/api/folios/${f.orgA.folioId}/close`,
    allowed: ['receptionistA', 'adminA'],
    denied: ['chefA', 'restrictedA'],
  },
  { label: 'sales report', method: 'get', denyPath: '/api/reports/sales', allowPath: () => '/api/reports/sales', allowed: ['accountantA', 'auditorA', 'adminA'], denied: ['cashierA', 'restrictedA'] },
  {
    label: 'occupancy report',
    method: 'get',
    denyPath: '/api/reports/occupancy',
    allowPath: f => `/api/reports/occupancy?propertyId=${f.orgA.propertyId}`,
    allowed: ['accountantA', 'auditorA', 'adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  { label: 'AI insights', method: 'get', denyPath: '/api/ai/insights', allowPath: () => '/api/ai/insights', allowed: ['accountantA', 'adminA'], denied: ['cashierA', 'restrictedA'] },
  { label: 'supplier list', method: 'get', denyPath: '/api/suppliers', allowPath: () => '/api/suppliers', allowed: ['adminA'], denied: ['cashierA', 'storekeeperA', 'restrictedA'] },
  {
    label: 'supplier create',
    method: 'post',
    denyPath: '/api/suppliers',
    allowPath: () => '/api/suppliers',
    allowBody: (_f, key) => ({ name: 'RBAC', code: `B39-RBAC-SUP-${key}` }),
    allowed: ['adminA'],
    denied: ['cashierA', 'storekeeperA', 'restrictedA'],
  },
  { label: 'purchase order list', method: 'get', denyPath: '/api/purchase-orders', allowPath: () => '/api/purchase-orders', allowed: ['adminA'], denied: ['cashierA', 'storekeeperA', 'restrictedA'] },
  {
    label: 'purchase order create',
    method: 'post',
    denyPath: '/api/purchase-orders',
    allowPath: () => '/api/purchase-orders',
    allowBody: f => ({ supplierId: f.orgA.supplierId, items: [{ inventoryItemId: f.orgA.inventoryItemId, quantity: 1, unitCost: 5 }] }),
    allowed: ['adminA'],
    denied: ['cashierA', 'storekeeperA', 'restrictedA'],
  },
  {
    label: 'menu create',
    method: 'post',
    denyPath: '/api/menus',
    allowPath: () => '/api/menus',
    allowBody: (f, key) => ({ outletId: f.orgA.outletId, name: 'RBAC', code: `B39-RBAC-MENU-${key}` }),
    allowed: ['adminA'],
    denied: ['cashierA', 'waiterA', 'chefA', 'restrictedA'],
  },
  {
    label: 'product create',
    method: 'post',
    denyPath: '/api/products',
    allowPath: () => '/api/products',
    allowBody: (f, key) => ({ menuCategoryId: f.orgA.categoryId, name: 'RBAC', code: `B39-RBAC-PROD-${key}`, price: 5 }),
    allowed: ['adminA'],
    denied: ['cashierA', 'waiterA', 'chefA', 'restrictedA'],
  },
  {
    label: 'reservation create',
    method: 'post',
    denyPath: '/api/reservations',
    allowPath: () => '/api/reservations',
    allowBody: f => ({
      propertyId: f.orgA.propertyId,
      guestId: f.orgA.guestId,
      roomTypeId: f.orgA.roomTypeId,
      checkInDate: nextDay(),
      checkOutDate: nextWeek(),
      adults: 1,
    }),
    allowed: ['receptionistA', 'adminA'],
    denied: ['cashierA', 'chefA', 'waiterA', 'restrictedA'],
  },
  {
    label: 'reservation status change',
    method: 'patch',
    denyPath: '/api/reservations/some-id',
    allowPath: f => `/api/reservations/${f.orgA.reservationId}`,
    allowBody: () => ({ status: 'CHECKED_IN' }),
    allowed: ['receptionistA', 'adminA'],
    denied: ['cashierA', 'chefA', 'waiterA', 'restrictedA'],
  },
  {
    label: 'room create',
    method: 'post',
    denyPath: '/api/rooms',
    allowPath: () => '/api/rooms',
    allowBody: (f, key) => ({ propertyId: f.orgA.propertyId, roomTypeId: f.orgA.roomTypeId, roomNumber: `B39-${key}` }),
    allowed: ['adminA'],
    denied: ['cashierA', 'chefA', 'restrictedA'],
  },
  {
    label: 'guest create',
    method: 'post',
    denyPath: '/api/guests',
    allowPath: () => '/api/guests',
    allowBody: (_f, key) => ({ propertyId: fixture.orgA.propertyId, firstName: 'RBAC', lastName: key, email: `rbac-${key}@testorga.com` }),
    allowed: ['adminA'],
    denied: ['cashierA', 'chefA', 'receptionistA', 'restrictedA'],
  },
  { label: 'order list', method: 'get', denyPath: '/api/orders', allowPath: () => '/api/orders', allowed: ['cashierA', 'waiterA', 'chefA', 'adminA'], denied: ['restrictedA', 'housekeeperA'] },
  { label: 'order read', method: 'get', denyPath: '/api/orders/some-id', allowPath: f => `/api/orders/${f.orgA.orderId}`, allowed: ['cashierA', 'adminA'], denied: ['restrictedA', 'housekeeperA'] },
  { label: 'shift list', method: 'get', denyPath: '/api/shifts', allowPath: () => '/api/shifts', allowed: ['cashierA', 'adminA'], denied: ['restrictedA', 'chefA'] },
  { label: 'user list', method: 'get', denyPath: '/api/users', allowPath: () => '/api/users', allowed: ['adminA', 'superAdminA'], denied: ['cashierA', 'chefA', 'waiterA', 'receptionistA', 'restrictedA'] },
  { label: 'backup list', method: 'get', denyPath: '/api/admin/backups', allowPath: () => '/api/admin/backups', allowed: ['adminA'], denied: ['cashierA', 'accountantA', 'auditorA', 'restrictedA'] },
  {
    label: 'loyalty read',
    method: 'get',
    denyPath: '/api/loyalty/account',
    allowPath: f => `/api/loyalty/account?guestId=${f.orgA.guestId}`,
    allowed: ['receptionistA', 'adminA'],
    denied: ['cashierA', 'restrictedA'],
  },
  {
    label: 'loyalty award',
    method: 'post',
    denyPath: '/api/loyalty/points',
    allowPath: () => `/api/loyalty/points`,
    allowBody: (f, key) => ({ guestId: f.orgA.guestId, points: 10, reason: `rbac-${key}` }),
    allowed: ['adminA'],
    denied: ['cashierA', 'chefA', 'receptionistA', 'restrictedA'],
  },
]

describe('B39 RBAC — permission matrix', () => {
  for (const testCase of PERMISSION_CASES) {
    it(`denies ${testCase.label} to an unauthorized role`, async () => {
      for (const role of testCase.denied) {
        const res = await (request(app) as any)[testCase.method](testCase.denyPath).set(authHeaders(await tokenFor(role)))
        expect(res.status, `${role} -> ${testCase.denyPath}`).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
      }
    })

    it(`allows ${testCase.label} to an authorized role`, async () => {
      for (const role of testCase.allowed) {
        const path = testCase.allowPath(fixture)
        const body = testCase.allowBody ? testCase.allowBody(fixture, role) : undefined
        const res = await (request(app) as any)[testCase.method](path).send(body).set(authHeaders(await tokenFor(role)))
        expect(res.status, `${role} -> ${path} returned ${res.status}`).not.toBe(403)
        expect([200, 201, 400], `${role} -> ${path} returned ${res.status}`).toContain(res.status)
      }
    })
  }
})

describe('B39 RBAC — existing POS permission model is preserved', () => {
  it('chef may advance order status but may not create orders', async () => {
    const cashier = await tokenFor('cashierA')
    const chef = await tokenFor('chefA')
    const order = await request(app)
      .post('/api/orders')
      .set(authHeaders(cashier))
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    await request(app)
      .post('/api/orders')
      .set(authHeaders(chef))
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .expect(403)

    await request(app)
      .patch(`/api/orders/${order.body.data.id}/status`)
      .set(authHeaders(chef))
      .send({ status: 'OPEN' })
      .expect(200)
  })

  it('chef may not refund payments', async () => {
    const res = await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(await tokenFor('chefA')))
      .send({ paymentId: fixture.orgA.orderId, amount: 1 })
      .expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('a user with no permissions cannot reach any protected domain', async () => {
    const restricted = authHeaders(await tokenFor('restrictedA'))
    for (const path of [
      '/api/orders',
      '/api/guests',
      '/api/inventory',
      '/api/reports/sales',
      '/api/users',
      '/api/admin/backups',
      '/api/housekeeping',
      '/api/maintenance',
      '/api/suppliers',
      '/api/purchase-orders',
      '/api/folios',
      '/api/online-orders',
      '/api/shifts',
      '/api/loyalty/account',
    ]) {
      const res = await request(app).get(path).set(restricted)
      expect(res.status, path).toBe(403)
    }
  })
})

describe('B39 RBAC — permissions are never inherited across organizations', () => {
  it('an Organization A super admin cannot modify Organization B', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${fixture.orgB.organizationId}`)
      .set(authHeaders(await tokenFor('superAdminA')))
      .send({ name: 'hijacked' })
    expect([403, 404]).toContain(res.status)
    const org = await prisma.organization.findUnique({ where: { id: fixture.orgB.organizationId } })
    expect(org.name).not.toBe('hijacked')
  })

  it('an Organization B admin cannot enumerate Organization A users', async () => {
    const res = await request(app).get('/api/users').set(authHeaders(await tokenFor('adminB'))).expect(200)
    const ids = res.body.data.map((u: any) => u.id)
    const orgAUserIds = [
      fixture.users.adminA,
      fixture.users.receptionistA,
      fixture.users.cashierA,
      fixture.users.restrictedA,
      fixture.users.housekeeperA,
    ]
    expect(ids.some((id: string) => orgAUserIds.includes(id))).toBe(false)
  })
})

describe('B39 RBAC — structural configuration writes require users_manage', () => {
  const STRUCTURAL_WRITES: Array<{ label: string; method: 'post' | 'patch' | 'delete'; path: (f: SecurityFixture) => string; body?: any }> = [
    { label: 'create outlet', method: 'post', path: () => '/api/outlets', body: { name: 'X', code: 'B39-XO' } },
    { label: 'update outlet', method: 'patch', path: f => `/api/outlets/${f.orgA.outletId}`, body: { name: 'hijacked' } },
    { label: 'delete outlet', method: 'delete', path: f => `/api/outlets/${f.orgA.outletId}` },
    { label: 'create terminal', method: 'post', path: () => '/api/terminals', body: { outletId: '', name: 'X', code: 'B39-XT' } },
    { label: 'update terminal', method: 'patch', path: f => `/api/terminals/${f.orgA.terminalId}`, body: { name: 'hijacked' } },
    { label: 'delete terminal', method: 'delete', path: f => `/api/terminals/${f.orgA.terminalId}` },
    { label: 'create table', method: 'post', path: () => '/api/tables', body: { outletId: '', name: 'X', code: 'B39-XTB', capacity: 2 } },
    { label: 'update table', method: 'patch', path: f => `/api/tables/${f.orgA.tableId}`, body: { name: 'hijacked' } },
    { label: 'create room type', method: 'post', path: () => '/api/room-types', body: { name: 'X', code: 'B39-XRT', baseRate: 100, capacity: 2 } },
    { label: 'update room type', method: 'patch', path: f => `/api/room-types/${f.orgA.roomTypeId}`, body: { name: 'hijacked' } },
    { label: 'delete room type', method: 'delete', path: f => `/api/room-types/${f.orgA.roomTypeId}` },
  ]

  it.each(STRUCTURAL_WRITES)('a user without users_manage cannot $label', async ({ method, path, body }) => {
    const payload = { ...body, ...(body?.outletId === '' ? { outletId: fixture.orgA.outletId } : {}) }
    const chef = authHeaders(await tokenFor('chefA'))
    const res = await (request(app) as any)[method](path(fixture)).set(chef).send(payload)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it.each(STRUCTURAL_WRITES)('the failed $label left no data behind', async ({ method, path, body }) => {
    const before = {
      outlets: await prisma.outlet.count(),
      terminals: await prisma.terminal.count(),
      tables: await prisma.table.count(),
      roomTypes: await prisma.roomType.count(),
    }
    await (request(app) as any)[method](path(fixture)).set(authHeaders(await tokenFor('chefA'))).send({ ...body, ...(body?.outletId === '' ? { outletId: fixture.orgA.outletId } : {}) })
    expect({
      outlets: await prisma.outlet.count(),
      terminals: await prisma.terminal.count(),
      tables: await prisma.table.count(),
      roomTypes: await prisma.roomType.count(),
    }).toEqual(before)
  })

  it('an administrator with users_manage can still perform the same write', async () => {
    const res = await request(app)
      .post('/api/tables')
      .set(authHeaders(await tokenFor('adminA')))
      .send({ outletId: fixture.orgA.outletId, name: 'B39 Permitted', code: `B39-PT-${Date.now()}`, capacity: 4 })
      .expect(201)
    const created = await prisma.table.findUnique({ where: { id: res.body.data.id } })
    expect(created).not.toBeNull()
    await prisma.table.delete({ where: { id: res.body.data.id } })
  })

  it('structural reads stay available to operational roles inside their own tenant', async () => {
    // A waiter must be able to read tables to seat a guest; the boundary that
    // matters is the tenant, which the IDOR suite already proves.
    for (const path of ['/api/tables', '/api/terminals', '/api/outlets', '/api/room-types', '/api/rooms', '/api/menus', '/api/products']) {
      const res = await request(app).get(path).set(authHeaders(await tokenFor('waiterA')))
      expect(res.status, path).toBe(200)
      const body = JSON.stringify(res.body)
      expect(body, path).not.toContain(fixture.orgB.outletId)
      expect(body, path).not.toContain(fixture.orgB.propertyId)
    }
  })
})
