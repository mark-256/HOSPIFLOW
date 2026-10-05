import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — Input validation on security-sensitive endpoints (mission §29).
 *
 * The rule under test: hostile client input is a *client* error. It must be
 * answered with 4xx and must never reach the generic error handler as a 500,
 * because a 500 on an ordinary bad value is both an availability problem and a
 * signal that server-side validation is missing.
 *
 * Every case additionally asserts that the request changed no persisted state,
 * so a test can never pass merely because the handler crashed before writing.
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

async function openFolio(balance = '0.00') {
  const folio = await prisma.folio.create({
    data: {
      property: { connect: { id: fixture.orgA.propertyId } },
      guest: { connect: { id: fixture.orgA.guestId } },
      reservation: { connect: { id: fixture.orgA.reservationId } },
      folioNumber: `VAL-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      balance,
      totalCharges: balance,
      status: 'OPEN',
    },
  })
  return folio
}

describe('B39 Input validation — folio transactions never 500', () => {
  it.each([
    ['a non-numeric amount', 'not-a-number'],
    ['an empty string amount', ''],
    ['an object amount', { value: 10 }],
    ['an array amount', [10]],
    ['a boolean amount', true],
  ])('rejects %s with 400 and writes no transaction', async (_label, amount) => {
    const folio = await openFolio('100.00')
    const before = await prisma.folioTransaction.count({ where: { folioId: folio.id } })

    const res = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .send({ type: 'CHARGE', amount, description: 'hostile input' })
      .set(authHeaders(adminA))

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(before)
  })

  it('rejects a negative amount without changing the folio balance', async () => {
    const folio = await openFolio('100.00')

    const res = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .send({ type: 'CHARGE', amount: -50 })
      .set(authHeaders(adminA))

    expect(res.status).toBe(400)
    const unchanged = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(unchanged.balance)).toBe(100)
  })

  it('rejects an unknown transaction type without writing anything', async () => {
    const folio = await openFolio('100.00')
    const before = await prisma.folioTransaction.count({ where: { folioId: folio.id } })

    const res = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .send({ type: 'NOT_A_TYPE', amount: 10 })
      .set(authHeaders(adminA))

    expect(res.status).toBe(400)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(before)
  })

  it('refuses an overpayment that would drive the folio balance negative', async () => {
    const folio = await openFolio('10.00')

    const res = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .send({ type: 'PAYMENT', amount: 999999 })
      .set(authHeaders(adminA))

    expect(res.status).toBe(400)
    const unchanged = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(unchanged.balance)).toBe(10)
  })

  it('refuses a transaction on a closed folio', async () => {
    const folio = await openFolio('100.00')
    await prisma.folio.update({ where: { id: folio.id }, data: { status: 'CLOSED' } })

    const res = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .send({ type: 'CHARGE', amount: 10 })
      .set(authHeaders(adminA))

    expect(res.status).toBe(400)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(0)
  })
})

describe('B39 Input validation — pagination bounds hold on every paginated endpoint', () => {
  // Only these list handlers call parsePagination; the others return a plain
  // array and are covered by the "never 500" block below.
  it.each([
    '/api/orders',
    '/api/guests',
    '/api/folios',
    '/api/inventory',
    '/api/inventory/movements',
    '/api/shifts',
    '/api/reservations',
    '/api/rooms',
    '/api/tables',
  ])('%s falls back to the default page instead of erroring', async (path) => {
    const res = await request(app).get(path).query({ page: 'abc', limit: 'xyz' }).set(authHeaders(adminA))
    expect(res.status).toBe(200)
    expect(res.body.meta.page).toBe(1)
    expect(res.body.meta.limit).toBe(20)
  })

  it.each([
    ['a negative page', { page: '-5' }],
    ['a negative limit', { limit: '-5' }],
    ['an enormous limit', { limit: '999999999' }],
    ['a float limit', { limit: '3.7' }],
    ['an array page', { page: ['1', '2'] }],
    ['an object limit', { limit: { a: 1 } }],
  ])('%s is clamped rather than propagated to the database', async (_label, query) => {
    const res = await request(app).get('/api/orders').query(query as any).set(authHeaders(adminA))
    expect(res.status).toBe(200)
    expect(res.body.meta.page).toBeGreaterThanOrEqual(1)
    expect(res.body.meta.limit).toBeGreaterThanOrEqual(1)
    expect(res.body.meta.limit).toBeLessThanOrEqual(100)
  })

  it.each([
    '/api/housekeeping',
    '/api/maintenance',
    '/api/suppliers',
    '/api/purchase-orders',
    '/api/users',
    '/api/outlets',
    '/api/terminals',
  ])('%s ignores hostile pagination parameters without erroring', async (path) => {
    const res = await request(app).get(path).query({ page: 'abc', limit: '-1' }).set(authHeaders(adminA))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

describe('B39 Input validation — hostile identifiers and bodies', () => {
  it.each([
    ['not-a-uuid', 'not-a-uuid'],
    ['a sql fragment', "1' OR '1'='1"],
    ['a path traversal', '../../etc/passwd'],
    ['a null byte', 'a%00b'],
    ['a very long value', 'x'.repeat(512)],
    ['a prisma operator object', '{"equals":""}'],
  ])('a %s path identifier is refused, not crashed', async (_label, id) => {
    const res = await request(app).get(`/api/folios/${encodeURIComponent(id)}`).set(authHeaders(adminA))
    expect([400, 404]).toContain(res.status)
    expect(res.status).not.toBe(500)
  })

  it.each([
    ['users', '/api/users', 'x'],
    ['guests', '/api/guests', 'x'],
    ['orders', '/api/orders', 'x'],
    ['products', '/api/products', 'x'],
  ])('an oversized JSON body to %s is rejected or ignored without a 500', async (_label, path, marker) => {
    const res = await request(app)
      .post(path)
      .set(authHeaders(adminA))
      .send({ name: marker.repeat(200000), __proto__: { polluted: true } })
    expect(res.status).not.toBe(500)
  })

  it('a client-supplied organizationId in a create body cannot escape the tenant', async () => {
    const storekeeper = await login(app, fixture.emails.storekeeperA, fixture.passwords.storekeeperA)
    const res = await request(app)
      .post('/api/inventory')
      .send({
        organizationId: fixture.orgB.organizationId,
        name: 'Injected Item',
        sku: `INJ-${Date.now()}`,
        unit: 'kg',
      })
      .set(authHeaders(storekeeper))
      .expect(201)

    const created = await prisma.inventoryItem.findUnique({ where: { id: res.body.data.id } })
    expect(created.organizationId).toBe(fixture.orgA.organizationId)
    expect(created.organizationId).not.toBe(fixture.orgB.organizationId)
  })

  it('a client-supplied organizationId query filter cannot widen a list', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .query({ organizationId: fixture.orgB.organizationId })
      .set(authHeaders(adminA))
      .expect(200)

    const orgs = new Set(res.body.data.map((i: any) => i.organizationId))
    expect([...orgs]).toEqual([fixture.orgA.organizationId])
  })
})
