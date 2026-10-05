import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — Privilege escalation and mass-assignment suite (mission §14, §30).
 *
 * Protected columns (organizationId, roleId, isActive, createdBy, ownerId)
 * must never be settable by a client in a way that changes the caller's own
 * authority or crosses a tenant boundary.
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

describe('B39 Privilege escalation — self service', () => {
  it('a user cannot change their own role', async () => {
    const res = await request(app)
      .patch(`/api/users/${fixture.users.adminA}`)
      .set(authHeaders(adminA))
      .send({ roleId: fixture.roleIds.orgA.WAITER })
      .expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')

    const user = await prisma.user.findUnique({ where: { id: fixture.users.adminA } })
    expect(user.roleId).toBe(fixture.roleIds.orgA.ORG_ADMIN)
  })

  it('a user cannot promote themselves to SUPER_ADMIN', async () => {
    const res = await request(app)
      .patch(`/api/users/${fixture.users.adminA}`)
      .set(authHeaders(adminA))
      .send({ roleId: fixture.roleIds.orgA.SUPER_ADMIN })
      .expect(403)

    const user = await prisma.user.findUnique({ where: { id: fixture.users.adminA } })
    expect(user.roleId).toBe(fixture.roleIds.orgA.ORG_ADMIN)
    expect(res.body.success).toBe(false)
  })

  it('a user cannot deactivate their own account', async () => {
    const res = await request(app)
      .patch(`/api/users/${fixture.users.adminA}`)
      .set(authHeaders(adminA))
      .send({ isActive: false })
      .expect(403)

    const user = await prisma.user.findUnique({ where: { id: fixture.users.adminA } })
    expect(user.isActive).toBe(true)
  })

  it('a user cannot delete their own account through the admin route', async () => {
    const res = await request(app).delete(`/api/users/${fixture.users.adminA}`).set(authHeaders(adminA)).expect(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    const user = await prisma.user.findUnique({ where: { id: fixture.users.adminA } })
    expect(user.deletedAt).toBeNull()
  })
})

describe('B39 Privilege escalation — role assignment', () => {
  it('an Organization A admin cannot grant a role owned by Organization B', async () => {
    const res = await request(app).post('/api/users').set(authHeaders(adminA)).send({
      roleId: fixture.roleIds.orgB.CASHIER,
      email: 'b39-cross-role@testorga.com',
      password: 'B39-Cross@123',
      firstName: 'Cross',
      lastName: 'Role',
    })
    expect(res.status).toBe(400)
  })

  it('a non-super-admin cannot mint a new SUPER_ADMIN', async () => {
    const res = await request(app).post('/api/users').set(authHeaders(adminA)).send({
      roleId: fixture.roleIds.orgA.SUPER_ADMIN,
      email: 'b39-minted-superadmin@testorga.com',
      password: 'B39-Cross@123',
      firstName: 'Minted',
      lastName: 'SuperAdmin',
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')

    const created = await prisma.user.findFirst({ where: { email: 'b39-minted-superadmin@testorga.com' } })
    expect(created).toBeNull()
  })

  it('a super admin can grant the SUPER_ADMIN role inside its own organization', async () => {
    const superAdmin = await login(app, fixture.emails.superAdminA, fixture.passwords.superAdminA)
    const res = await request(app).post('/api/users').set(authHeaders(superAdmin)).send({
      roleId: fixture.roleIds.orgA.SUPER_ADMIN,
      email: 'b39-legit-superadmin@testorga.com',
      password: 'B39-Cross@123',
      firstName: 'Legit',
      lastName: 'SuperAdmin',
    })
    expect(res.status).toBe(201)
    const created = await prisma.user.findUnique({ where: { id: res.body.data.id } })
    expect(created.roleId).toBe(fixture.roleIds.orgA.SUPER_ADMIN)
    expect(created.organizationId).toBe(fixture.orgA.organizationId)
  })

  it('an Organization A admin can still change another user role inside its own organization', async () => {
    const target = await prisma.user.create({
      data: {
        organizationId: fixture.orgA.organizationId,
        roleId: fixture.roleIds.orgA.WAITER,
        email: 'b39-roletarget@testorga.com',
        passwordHash: await import('bcrypt').then(b => b.hash('B39-Cross@123', 10)),
        firstName: 'Role',
        lastName: 'Target',
      },
    })
    const res = await request(app)
      .patch(`/api/users/${target.id}`)
      .set(authHeaders(adminA))
      .send({ roleId: fixture.roleIds.orgA.CHEF })
      .expect(200)
    expect(res.body.data.roleId).toBe(fixture.roleIds.orgA.CHEF)
  })

  it('a role change is recorded in the tenant audit log', async () => {
    const target = await prisma.user.create({
      data: {
        organizationId: fixture.orgA.organizationId,
        roleId: fixture.roleIds.orgA.WAITER,
        email: 'b39-roletarget2@testorga.com',
        passwordHash: await import('bcrypt').then(b => b.hash('B39-Cross@123', 10)),
        firstName: 'Role',
        lastName: 'Target2',
      },
    })
    await request(app)
      .patch(`/api/users/${target.id}`)
      .set(authHeaders(adminA))
      .send({ roleId: fixture.roleIds.orgA.CHEF })
      .expect(200)

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: fixture.orgA.organizationId, action: 'PERMISSION_CHANGED', entityId: target.id },
    })
    expect(audit).not.toBeNull()
  })
})

describe('B39 Privilege escalation — tenant columns are server derived', () => {
  const massAssignmentCases: Array<{ label: string; method: 'post' | 'patch'; path: string; body: any; model: string; field: string }> = [
    {
      label: 'user create',
      method: 'post',
      path: '/api/users',
      body: { roleId: '', email: 'b39-mass-user@testorga.com', password: 'B39-Cross@123', firstName: 'Mass', lastName: 'Assign', organizationId: '' },
      model: 'user',
      field: 'organizationId',
    },
    {
      label: 'guest create',
      method: 'post',
      path: '/api/guests',
      body: { propertyId: '', firstName: 'Mass', lastName: 'Assign', organizationId: '' },
      model: 'guest',
      field: 'propertyId',
    },
    {
      label: 'order create',
      method: 'post',
      path: '/api/orders',
      body: { outletId: '', orderType: 'DINE_IN', organizationId: '', createdById: '', total: 999999, balance: 0 },
      model: 'order',
      field: 'outletId',
    },
    {
      label: 'supplier create',
      method: 'post',
      path: '/api/suppliers',
      body: { name: 'Mass', code: 'B39-MASS-SUP', organizationId: '' },
      model: 'supplier',
      field: 'organizationId',
    },
    {
      label: 'inventory item create',
      method: 'post',
      path: '/api/inventory',
      body: { name: 'Mass', sku: 'B39-MASS-INV', unit: 'pcs', organizationId: '' },
      model: 'inventoryItem',
      field: 'organizationId',
    },
  ]

  it.each(massAssignmentCases)('$label cannot escape the caller organization', async ({ method, path, body, model, field }) => {
    const withIds = JSON.parse(JSON.stringify(body))
    if (field === 'organizationId') withIds.organizationId = fixture.orgB.organizationId
    if (field === 'propertyId') withIds.propertyId = fixture.orgB.propertyId
    if (field === 'outletId') withIds.outletId = fixture.orgB.outletId
    if (path === '/api/users') withIds.roleId = fixture.roleIds.orgA.WAITER

    const res = await (request(app) as any)[method](path).send(withIds).set(authHeaders(adminA))
    expect([201, 400, 403, 404], `${path} returned ${res.status}`).toContain(res.status)

    if (res.status === 201) {
      const created = await (prisma as any)[model].findUnique({ where: { id: res.body.data.id } })
      if (field === 'organizationId') expect(created.organizationId).toBe(fixture.orgA.organizationId)
      if (field === 'propertyId') expect(created.propertyId).toBe(fixture.orgA.propertyId)
      if (field === 'outletId') expect(created.outletId).toBe(fixture.orgA.outletId)
    }
  })

  it('an order cannot be created with a client supplied total or creator', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        outletId: fixture.orgA.outletId,
        orderType: 'DINE_IN',
        total: 999999,
        subtotal: 999999,
        balance: -999999,
        createdById: fixture.users.adminB,
        status: 'COMPLETED',
      })
      .set(authHeaders(adminA))
      .expect(201)

    const order = await prisma.order.findUnique({ where: { id: res.body.data.id } })
    expect(Number(order.total)).toBe(0)
    expect(order.status).toBe('DRAFT')
    expect(order.createdById).toBe(fixture.users.adminA)
  })

  it('a folio transaction cannot set an arbitrary creator or folio', async () => {
    const res = await request(app)
      .post(`/api/folios/${fixture.orgA.folioId}/transactions`)
      .send({ type: 'PAYMENT', category: 'CASH', description: 'mass', amount: 1, createdBy: fixture.users.adminB, folioId: fixture.orgB.folioId })
      .set(authHeaders(adminA))
      .expect(201)

    const transaction = await prisma.folioTransaction.findUnique({ where: { id: res.body.data.id } })
    expect(transaction.folioId).toBe(fixture.orgA.folioId)
    expect(transaction.createdBy).toBe(fixture.users.adminA)
  })

  it('a purchase order cannot be created with a foreign creator or organization', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .send({
        supplierId: fixture.orgA.supplierId,
        organizationId: fixture.orgB.organizationId,
        createdBy: fixture.users.adminB,
        items: [{ inventoryItemId: fixture.orgA.inventoryItemId, quantity: 1, unitCost: 5 }],
      })
      .set(authHeaders(adminA))
      .expect(201)

    const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: res.body.data.id } })
    expect(purchaseOrder.organizationId).toBe(fixture.orgA.organizationId)
    expect(purchaseOrder.createdBy).toBe(fixture.users.adminA)
    expect(purchaseOrder.status).toBe('DRAFT')
  })

  it('a stock movement cannot set an arbitrary creator or reference tenant', async () => {
    const res = await request(app)
      .post('/api/inventory/movements')
      .send({
        inventoryItemId: fixture.orgA.inventoryItemId,
        type: 'ADJUSTMENT',
        quantity: 1,
        createdBy: fixture.users.adminB,
        orderId: fixture.orgB.orderId,
      })
      .set(authHeaders(adminA))
      .expect(201)

    const movement = await prisma.stockMovement.findUnique({ where: { id: res.body.data.id } })
    expect(movement.createdBy).toBe(fixture.users.adminA)
    expect(movement.orderId).toBeNull()
  })
})

describe('B39 Privilege escalation — organization administration', () => {
  it('an admin cannot deactivate another organization', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${fixture.orgB.organizationId}`)
      .set(authHeaders(adminA))
      .send({ status: 'SUSPENDED' })
    expect([403, 404]).toContain(res.status)
    const org = await prisma.organization.findUnique({ where: { id: fixture.orgB.organizationId } })
    expect(org.status).toBe('ACTIVE')
  })

  it('an admin can still update their own organization', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${fixture.orgA.organizationId}`)
      .set(authHeaders(adminA))
      .send({ name: 'Test Hotel Group A (renamed)' })
      .expect(200)
    expect(res.body.data.name).toBe('Test Hotel Group A (renamed)')
  })

  it('an admin cannot delete a user belonging to another organization', async () => {
    const res = await request(app).delete(`/api/users/${fixture.users.adminB}`).set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
    const user = await prisma.user.findUnique({ where: { id: fixture.users.adminB } })
    expect(user.deletedAt).toBeNull()
  })

  it('an admin cannot patch a user belonging to another organization', async () => {
    const res = await request(app)
      .patch(`/api/users/${fixture.users.adminB}`)
      .set(authHeaders(adminA))
      .send({ firstName: 'hijacked' })
    expect([403, 404]).toContain(res.status)
    const user = await prisma.user.findUnique({ where: { id: fixture.users.adminB } })
    expect(user.firstName).not.toBe('hijacked')
  })

  it('user responses never include the password hash', async () => {
    const list = await request(app).get('/api/users').set(authHeaders(adminB)).expect(200)
    expect(JSON.stringify(list.body)).not.toContain('passwordHash')
    const single = await request(app).get(`/api/users/${fixture.users.adminB}`).set(authHeaders(adminB)).expect(200)
    expect(JSON.stringify(single.body)).not.toContain('passwordHash')
    expect(JSON.stringify(single.body)).not.toContain('$2b$')
  })
})
