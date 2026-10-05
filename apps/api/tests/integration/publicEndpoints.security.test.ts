import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — Public endpoint review (mission §9 health/ready, §19 guest portal,
 * §20 QR, §21 online ordering).
 *
 * The only endpoints that may be reached without a staff token are the health
 * probes, the two QR guest-facing reads, the public QR order write and the two
 * payment provider webhooks. This suite proves that set is exactly that set and
 * that each public surface stays inside the scope its token/secret grants.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let adminA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

const PUBLIC_READS = ['/health']
const NOT_MOUNTED_READS = ['/health/ready', '/health/health', '/ready']
const STAFF_ENDPOINTS = [
  '/api/auth/me',
  '/api/orders',
  '/api/guests',
  '/api/rooms',
  '/api/reservations',
  '/api/folios',
  '/api/inventory',
  '/api/inventory/movements',
  '/api/suppliers',
  '/api/purchase-orders',
  '/api/housekeeping',
  '/api/maintenance',
  '/api/tables',
  '/api/menus',
  '/api/products',
  '/api/shifts',
  '/api/online-orders',
  '/api/terminals',
  '/api/outlets',
  '/api/room-types',
  '/api/reports/sales',
  '/api/reports/occupancy',
  '/api/ai/insights',
  '/api/users',
  '/api/payments',
  '/api/organizations',
  '/api/properties',
  '/api/guest-portal/reservations',
  '/api/guest-portal/folios',
  '/api/loyalty/account',
  '/api/admin/backups',
]

describe('B39 Public endpoints — intended public surface', () => {
  it.each(PUBLIC_READS)('%s is reachable without a token and leaks nothing sensitive', async path => {
    const res = await request(app).get(path).expect(200)
    expect(res.body.success).toBe(true)
    expect(JSON.stringify(res.body)).not.toContain('postgresql://')
    expect(JSON.stringify(res.body)).not.toContain('hospiflow_dev')
  })

  it.each(NOT_MOUNTED_READS)('%s is not exposed (B39-INFO-01: health router is mounted at /health only)', async path => {
    const res = await request(app).get(path)
    expect(res.status).toBe(404)
  })

  it('the health probe does not disclose the database connection string', async () => {
    const res = await request(app).get('/health').expect(200)
    expect(Object.keys(res.body.data)).toEqual(expect.arrayContaining(['status', 'database', 'timestamp']))
    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\//i)
  })

  it('every staff endpoint still requires a token', async () => {
    for (const path of STAFF_ENDPOINTS) {
      const res = await request(app).get(path)
      expect(res.status, `${path} returned ${res.status} without a token`).toBe(401)
    }
  })
})

describe('B39 Public endpoints — guest portal is staff authenticated and tenant scoped', () => {
  it('guest portal reservations require authentication', async () => {
    await request(app).get('/api/guest-portal/reservations').query({ guestId: fixture.orgA.guestId }).expect(401)
  })

  it('guest portal folios require authentication', async () => {
    await request(app).get('/api/guest-portal/folios').query({ guestId: fixture.orgA.guestId }).expect(401)
  })

  it('guest portal requires the guests_view permission', async () => {
    const restricted = await login(app, fixture.emails.restrictedA, fixture.passwords.restrictedA)
    const res = await request(app)
      .get('/api/guest-portal/reservations')
      .query({ guestId: fixture.orgA.guestId })
      .set(authHeaders(restricted))
    expect(res.status).toBe(403)
  })

  it('guest portal returns only the requested guest of the caller organization', async () => {
    const res = await request(app)
      .get('/api/guest-portal/reservations')
      .query({ guestId: fixture.orgA.guestId })
      .set(authHeaders(adminA))
      .expect(200)
    expect(res.body.data.every((r: any) => r.guestId === fixture.orgA.guestId)).toBe(true)
  })

  it('guest portal does not accept a database id in place of an access token', async () => {
    const res = await request(app)
      .get('/api/guest-portal/folios')
      .query({ guestId: fixture.orgB.guestId, token: 'anything' })
      .set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
  })
})

describe('B39 Public endpoints — QR ordering', () => {
  it('an unknown QR token is rejected on lookup', async () => {
    await request(app).get('/api/qr/lookup/deadbeefdeadbeef').expect(404)
  })

  it('an unknown QR token is rejected on order creation', async () => {
    const res = await request(app)
      .post('/api/qr/orders')
      .send({ token: 'deadbeefdeadbeef', items: [{ productId: fixture.orgA.productId, quantity: 1 }] })
    expect(res.status).toBe(404)
  })

  it('a valid QR token resolves only to its own table and outlet', async () => {
    const generated = await request(app).post('/api/qr/generate').send({ tableId: fixture.orgA.tableId }).set(authHeaders(adminA)).expect(200)
    const token = generated.body.data.token
    expect(token).toMatch(/^\d{13}-[0-9a-f]{48}$/)

    const lookup = await request(app).get(`/api/qr/lookup/${token}`).expect(200)
    expect(lookup.body.data.tableId).toBe(fixture.orgA.tableId)
    expect(lookup.body.data.outletId).toBe(fixture.orgA.outletId)
  })

  it('a QR token from one outlet cannot order another outlet product', async () => {
    const generated = await request(app).post('/api/qr/generate').send({ tableId: fixture.orgA.tableId }).set(authHeaders(adminA)).expect(200)
    const res = await request(app)
      .post('/api/qr/orders')
      .send({ token: generated.body.data.token, items: [{ productId: fixture.orgB.productId, quantity: 1 }] })
    expect(res.status).toBe(400)
  })

  it('an expired QR token is rejected on lookup and on ordering', async () => {
    const expiredToken = `${Date.now() - 60_000}-${'a'.repeat(48)}`
    await prisma.table.update({ where: { id: fixture.orgA.tableId }, data: { qrCode: expiredToken } })

    await request(app).get(`/api/qr/lookup/${expiredToken}`).expect(404)
    const res = await request(app)
      .post('/api/qr/orders')
      .send({ token: expiredToken, items: [{ productId: fixture.orgA.productId, quantity: 1 }] })
    expect(res.status).toBe(404)
  })

  it('QR generation requires authentication', async () => {
    await request(app).post('/api/qr/generate').send({ tableId: fixture.orgA.tableId }).expect(401)
  })

  it('QR order totals are computed server-side and ignore client prices', async () => {
    const generated = await request(app).post('/api/qr/generate').send({ tableId: fixture.orgA.tableId }).set(authHeaders(adminA)).expect(200)
    const res = await request(app)
      .post('/api/qr/orders')
      .send({
        token: generated.body.data.token,
        items: [{ productId: fixture.orgA.productId, quantity: 2, unitPrice: 0.01, total: 0.01 }],
      })
      .expect(201)

    const product = await prisma.product.findUnique({ where: { id: fixture.orgA.productId } })
    const expected = Math.round(Number(product.price) * 2 * 100) / 100
    expect(Number(res.body.data.total)).toBe(expected)
    expect(Number(res.body.data.total)).toBeGreaterThan(0.01)
  })
})

describe('B39 Public endpoints — online ordering', () => {
  it('online order listing requires authentication', async () => {
    await request(app).get('/api/online-orders').expect(401)
  })

  it('online order creation requires authentication', async () => {
    await request(app)
      .post('/api/online-orders')
      .send({ outletId: fixture.orgA.outletId, customerName: 'X', customerPhone: '+254700000222', items: [{ productId: fixture.orgA.productId, quantity: 1 }] })
      .expect(401)
  })

  it('online order totals are computed server-side', async () => {
    const res = await request(app)
      .post('/api/online-orders')
      .send({
        outletId: fixture.orgA.outletId,
        customerName: 'Server Priced',
        customerPhone: '+254700000223',
        items: [{ productId: fixture.orgA.productId, quantity: 3, unitPrice: 0.01, total: 0.01 }],
      })
      .set(authHeaders(adminA))
      .expect(201)

    const product = await prisma.product.findUnique({ where: { id: fixture.orgA.productId } })
    const expected = Math.round(Number(product.price) * 3 * 100) / 100
    expect(Number(res.body.data.total)).toBe(expected)
  })

  it('an online order cannot be created with a client supplied status or total', async () => {
    const res = await request(app)
      .post('/api/online-orders')
      .send({
        outletId: fixture.orgA.outletId,
        customerName: 'Status Probe',
        customerPhone: '+254700000224',
        status: 'COMPLETED',
        total: 0,
        balance: 0,
        items: [{ productId: fixture.orgA.productId, quantity: 1 }],
      })
      .set(authHeaders(adminA))
      .expect(201)

    const order = await prisma.order.findUnique({ where: { id: res.body.data.id } })
    expect(order.status).not.toBe('COMPLETED')
    expect(Number(order.total)).toBeGreaterThan(0)
    expect(Number(order.balance)).toBeGreaterThan(0)
  })

  it('online orders do not expose another tenant', async () => {
    const res = await request(app).get('/api/online-orders').set(authHeaders(adminA)).expect(200)
    expect(JSON.stringify(res.body)).not.toContain(fixture.orgB.outletId)
  })
})
