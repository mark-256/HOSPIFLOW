import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B39 — Reporting security (mission §13).
 *
 * Reports aggregate across the whole organization, so a single missing scope
 * clause leaks every other tenant's trading data. This suite covers the
 * permission gate, tenant scoping of both aggregations, injection resistance of
 * the date/outlet/property parameters, and pagination bounds.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let adminA: AuthTokens
let adminB: AuthTokens
let chefA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
  chefA = await login(app, fixture.emails.chefA, fixture.passwords.chefA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

describe('B39 Reports — permission boundary', () => {
  it('both reports require authentication', async () => {
    await request(app).get('/api/reports/sales').expect(401)
    await request(app).get('/api/reports/occupancy').expect(401)
  })

  it('both reports require reports_view', async () => {
    const sales = await request(app).get('/api/reports/sales').set(authHeaders(chefA)).expect(403)
    expect(sales.body.error.code).toBe('FORBIDDEN')

    const occupancy = await request(app)
      .get('/api/reports/occupancy')
      .query({ propertyId: fixture.orgA.propertyId })
      .set(authHeaders(chefA))
      .expect(403)
    expect(occupancy.body.error.code).toBe('FORBIDDEN')
  })

  it('a forbidden report response contains no figures', async () => {
    const res = await request(app).get('/api/reports/sales').set(authHeaders(chefA)).expect(403)
    expect(res.body.data).toBeUndefined()
  })
})

describe('B39 Reports — sales tenant scoping', () => {
  it('the sales report returns only the caller organization orders', async () => {
    const res = await request(app).get('/api/reports/sales').set(authHeaders(adminA)).expect(200)
    expect(res.body.success).toBe(true)

    const orderIds = res.body.data.orders.map((o: any) => o.id)
    const foreign = await prisma.order.findMany({
      where: { outlet: { property: { organizationId: fixture.orgB.organizationId } } },
      select: { id: true },
    })
    expect(foreign.length).toBeGreaterThan(0)
    for (const o of foreign) {
      expect(orderIds).not.toContain(o.id)
    }
  })

  it('a foreign outletId filter does not widen the report', async () => {
    const res = await request(app)
      .get('/api/reports/sales')
      .query({ outletId: fixture.orgB.outletId })
      .set(authHeaders(adminA))
      .expect(200)
    expect(res.body.data.orders).toEqual([])
    expect(res.body.data.totalOrders).toBe(0)
    expect(res.body.data.totalSales).toBe(0)
  })

  it('each organization sees only its own totals', async () => {
    const resA = await request(app).get('/api/reports/sales').set(authHeaders(adminA)).expect(200)
    const resB = await request(app).get('/api/reports/sales').set(authHeaders(adminB)).expect(200)

    expect(resA.body.data.totalOrders).toBeGreaterThan(0)
    expect(resB.body.data.totalOrders).toBeGreaterThan(0)

    const idsA = new Set(resA.body.data.orders.map((o: any) => o.id))
    for (const order of resB.body.data.orders) {
      expect(idsA.has(order.id)).toBe(false)
    }
  })

  it('an organizationId query parameter is ignored', async () => {
    const res = await request(app)
      .get('/api/reports/sales')
      .query({ organizationId: fixture.orgB.organizationId })
      .set(authHeaders(adminA))
      .expect(200)

    const orderIds = res.body.data.orders.map((o: any) => o.id)
    const foreign = await prisma.order.findMany({
      where: { outlet: { property: { organizationId: fixture.orgB.organizationId } } },
      select: { id: true },
    })
    for (const o of foreign) expect(orderIds).not.toContain(o.id)
  })

  it('payment breakdown only aggregates the caller organization payments', async () => {
    const res = await request(app).get('/api/reports/sales').set(authHeaders(adminA)).expect(200)

    const orgAPayments = await prisma.orderPayment.findMany({
      where: { order: { outlet: { property: { organizationId: fixture.orgA.organizationId } } } },
      select: { amount: true },
    })
    const expectedTotal = orgAPayments.reduce((s: number, p: any) => s + Number(p.amount), 0)
    const byPaymentTotal = Object.values(res.body.data.byPayment as Record<string, number>).reduce((s, v) => s + Number(v), 0)
    // The report is paginated, so the breakdown can only be a subset, never more.
    expect(byPaymentTotal).toBeLessThanOrEqual(expectedTotal + 0.001)
  })
})

describe('B39 Reports — sales parameter handling', () => {
  const HOSTILE = [
    { from: "'; DROP TABLE \"Order\"; --" },
    { from: 'not-a-date' },
    { to: '9999-99-99' },
    { outletId: { $ne: null } },
    { outletId: ['a', 'b'] },
    { page: '-1', limit: '999999' },
    { limit: '0' },
    { limit: 'abc' },
  ]

  it.each(HOSTILE)('hostile query %j does not crash the report', async query => {
    const res = await request(app).get('/api/reports/sales').query(query as any).set(authHeaders(adminA))
    expect([200, 400]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.orders)).toBe(true)
    }
  })

  it('the report still works after the injection attempts', async () => {
    const orders = await prisma.order.count()
    expect(orders).toBeGreaterThan(0)
    const res = await request(app).get('/api/reports/sales').set(authHeaders(adminA)).expect(200)
    expect(res.body.success).toBe(true)
  })

  it('pagination is bounded', async () => {
    const res = await request(app).get('/api/reports/sales').query({ limit: 2 }).set(authHeaders(adminA)).expect(200)
    expect(res.body.data.orders.length).toBeLessThanOrEqual(2)
  })

  it('an invalid date is a 400, not an unhandled 500', async () => {
    const res = await request(app).get('/api/reports/sales').query({ from: 'not-a-date' }).set(authHeaders(adminA))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })

  it('an inverted date range is a 400', async () => {
    const res = await request(app)
      .get('/api/reports/sales')
      .query({ from: '2026-05-02', to: '2026-05-01' })
      .set(authHeaders(adminA))
      .expect(400)
    expect(res.body.error.code).toBe('BAD_REQUEST')
  })

  it('a non-numeric limit falls back to the default page size', async () => {
    const res = await request(app).get('/api/reports/sales').query({ limit: 'abc' }).set(authHeaders(adminA)).expect(200)
    expect(res.body.data.orders.length).toBeLessThanOrEqual(20)
  })

  it('a date range that excludes everything returns an empty report, not an error', async () => {
    const res = await request(app)
      .get('/api/reports/sales')
      .query({ from: '1990-01-01', to: '1990-01-02' })
      .set(authHeaders(adminA))
      .expect(200)
    expect(res.body.data.totalOrders).toBe(0)
    expect(res.body.data.avgOrderValue).toBe(0)
  })
})

describe('B39 Reports — occupancy tenant scoping', () => {
  it('occupancy counts only the caller organization property', async () => {
    const res = await request(app)
      .get('/api/reports/occupancy')
      .query({ propertyId: fixture.orgA.propertyId })
      .set(authHeaders(adminA))
      .expect(200)
    const expected = await prisma.room.count({ where: { propertyId: fixture.orgA.propertyId } })
    expect(res.body.data.total).toBe(expected)
  })

  it('a foreign propertyId returns an empty report rather than foreign figures', async () => {
    const res = await request(app)
      .get('/api/reports/occupancy')
      .query({ propertyId: fixture.orgB.propertyId })
      .set(authHeaders(adminA))
      .expect(200)
    expect(res.body.data.total).toBe(0)
    expect(res.body.data.occupied).toBe(0)
    expect(res.body.data.occupancyRate).toBe(0)
  })

  it('a property of the caller organization is visible to that organization only', async () => {
    const foreign = await request(app)
      .get('/api/reports/occupancy')
      .query({ propertyId: fixture.orgA.propertyId })
      .set(authHeaders(adminB))
      .expect(200)
    expect(foreign.body.data.total).toBe(0)
  })

  it('a missing propertyId does not enumerate every property', async () => {
    const res = await request(app).get('/api/reports/occupancy').set(authHeaders(adminA)).expect(200)
    expect(res.body.data.total).toBe(0)
  })

  it.each([{ date: "'; DROP TABLE \"Room\"; --" }, { date: 'not-a-date' }, { date: { $gt: '' } }])(
    'hostile date %j does not crash occupancy',
    async query => {
      const res = await request(app)
        .get('/api/reports/occupancy')
        .query({ propertyId: fixture.orgA.propertyId, ...(query as any) })
        .set(authHeaders(adminA))
      expect([200, 400]).toContain(res.status)
      if (res.status === 200) expect(res.body.success).toBe(true)
    }
  )

  it('occupancy does not leak guest identity or reservation detail', async () => {
    const res = await request(app)
      .get('/api/reports/occupancy')
      .query({ propertyId: fixture.orgA.propertyId })
      .set(authHeaders(adminA))
      .expect(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain(fixture.orgA.guestId)
    expect(body).not.toContain(fixture.orgA.reservationId)
    expect(Object.keys(res.body.data).sort()).toEqual(['occupancyRate', 'occupied', 'total'])
  })
})
