import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { createOrderWithItems, initiatePayment } from './helpers/b40Financial'

/**
 * B40 — Financial error handling (mission §36) and audit trail (mission §35).
 *
 * No hostile financial input may produce an uncontrolled 500, and no financial
 * error body may leak stack traces, SQL, Prisma internals or credentials.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let cashierA: AuthTokens
let adminA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

const LEAK_MARKERS = [
  '    at ',
  'node_modules',
  'prisma/',
  'SELECT ',
  'INSERT ',
  'UPDATE ',
  'DELETE ',
  'ECONNREFUSED',
  'DATABASE_URL',
  'postgresql://',
  'sk_live',
  'sk_test',
  'whsec_',
  'MPESA_CONSUMER_SECRET',
  'stack',
  '.ts:',
  ' PrismaClient',
  'ConnectorError',
  'QueryError',
]

function expectNoLeak(body: string) {
  for (const marker of LEAK_MARKERS) {
    expect(body).not.toContain(marker)
  }
}

describe('B40 financial errors — hostile input produces 4xx, never 500', () => {
  it('initiate rejects every hostile amount shape without an unhandled error', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const hostile: unknown[] = [
      -1, -0.01, 'abc', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
      [1], { a: 1 }, true, false, null, '', ' ', '0x10', '1e400', 1e308, -1e308,
      '99999999999999999999999999999999999999', { toString: () => '10' },
    ]

    for (const amount of hostile) {
      const res = await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount,
        method: 'CARD',
        provider: 'MOCK',
      })
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }
  }, 120000)

  it('initiate rejects a hostile idempotencyKey without an unhandled error', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const hostile: unknown[] = [[], {}, 42, true, null, { $ne: null }]

    for (const idempotencyKey of hostile) {
      const res = await initiatePayment(app, cashierA, {
        orderId: order.id,
        amount: 1,
        method: 'CARD',
        provider: 'MOCK',
        idempotencyKey,
      })
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }
  }, 60000)

  it('verify rejects a hostile paymentId without an unhandled error', async () => {
    for (const paymentId of [[], {}, 42, true, null, "'; DROP TABLE \"OrderPayment\"; --", 'a'.repeat(500)]) {
      const res = await request(app).post('/api/payments/verify').set(authHeaders(cashierA)).send({ paymentId })
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }
  }, 60000)

  it('refund rejects a hostile paymentId and amount without an unhandled error', async () => {
    for (const paymentId of [[], {}, 42, null, 'x'.repeat(500)]) {
      const res = await request(app)
        .post('/api/payments/refund')
        .set(authHeaders(adminA))
        .send({ paymentId, amount: 1 })
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: fixture.orgA.orderId } })
    if (payment) {
      for (const amount of [[], {}, 42, true, null, 'abc', Number.NaN]) {
        const res = await request(app)
          .post('/api/payments/refund')
          .set(authHeaders(adminA))
          .send({ paymentId: payment.id, amount })
        expect(res.status).toBeLessThan(500)
        expectNoLeak(JSON.stringify(res.body))
      }
    }
  }, 60000)

  it('folio transactions reject hostile amounts without an unhandled error', async () => {
    const folio = await prisma.folio.create({
      data: {
        propertyId: fixture.orgA.propertyId,
        guestId: fixture.orgA.guestId,
        reservationId: fixture.orgA.reservationId,
        folioNumber: `B40-ERR-${Date.now()}`,
        balance: 0,
        status: 'OPEN',
      },
    })

    for (const amount of [-1, 'abc', Number.NaN, Number.POSITIVE_INFINITY, [], {}, true, null, 1e308]) {
      const res = await request(app)
        .post(`/api/folios/${folio.id}/transactions`)
        .set(authHeaders(cashierA))
        .send({ type: 'CHARGE', category: 'ROOM', description: 'B40', amount })
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }
  }, 60000)

  it('order item creation rejects hostile prices and quantities without an unhandled error', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    for (const payload of [
      { unitPrice: 'abc' },
      { unitPrice: Number.NaN },
      { unitPrice: -5 },
      { quantity: 'abc' },
      { quantity: -5 },
      { quantity: 1e9 },
      { productId: null },
      { productId: ['x'] },
    ]) {
      const res = await request(app)
        .post(`/api/orders/${order.id}/items`)
        .set(authHeaders(cashierA))
        .send({ productId: fixture.orgA.productId, quantity: 1, ...payload })
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }
  }, 60000)

  it('the payment list rejects hostile query parameters without an unhandled error', async () => {
    for (const query of [
      { status: 'NOT_A_STATUS' },
      { provider: 'NOT_A_PROVIDER' },
      { from: 'not-a-date' },
      { to: 'not-a-date' },
      { page: '-1' },
      { limit: '1000000' },
      { page: 'abc', limit: 'abc' },
    ]) {
      const res = await request(app).get('/api/payments').query(query).set(authHeaders(adminA))
      expect(res.status).toBeLessThan(500)
      expectNoLeak(JSON.stringify(res.body))
    }
  }, 60000)

  it('a JSON body that is not an object does not crash the payment routes', async () => {
    for (const raw of ['[]', '"string"', '42', 'null', 'not json at all']) {
      for (const route of ['/api/payments/initiate', '/api/payments/verify', '/api/payments/refund']) {
        const res = await request(app)
          .post(route)
          .set('Content-Type', 'application/json')
          .set(authHeaders(adminA))
          .send(raw)
        expect(res.status).toBeLessThan(500)
        expectNoLeak(JSON.stringify(res.body))
      }
    }
  }, 60000)
})

describe('B40 audit trail — financial operations are recorded and tenant-scoped', () => {
  it('payment initiation writes a tenant-scoped audit entry without secrets', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const before = await prisma.auditLog.count({ where: { organizationId: fixture.orgA.organizationId } })

    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'CASH',
      provider: 'MOCK',
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: fixture.orgA.organizationId, entityId: payment.id },
    })
    expect(audits.length).toBeGreaterThan(0)
    expect(await prisma.auditLog.count({ where: { organizationId: fixture.orgA.organizationId } })).toBeGreaterThan(before)

    for (const entry of audits) {
      const serialised = JSON.stringify(entry.metadata ?? {})
      expectNoLeak(serialised)
      expect(serialised).not.toContain('Bearer ')
    }
  }, 30000)

  it('payment verification writes a tenant-scoped audit entry', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'CASH',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })

    await request(app).post('/api/payments/verify').set(authHeaders(cashierA)).send({ paymentId: payment.id }).expect(200)

    const audits = await prisma.auditLog.findMany({
      where: { organizationId: fixture.orgA.organizationId, entityId: payment.id },
    })
    expect(audits.length).toBeGreaterThan(0)
  }, 30000)

  it('a refund writes a tenant-scoped audit entry', async () => {
    const created = await request(app)
      .post('/api/orders')
      .set(authHeaders(cashierA))
      .send({ outletId: fixture.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)
    await request(app)
      .post(`/api/orders/${created.body.data.id}/items`)
      .set(authHeaders(cashierA))
      .send({ productId: fixture.orgA.productId, quantity: 1 })
      .expect(201)

    const order = await prisma.order.findUnique({ where: { id: created.body.data.id } })
    await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set(authHeaders(cashierA))
      .send({ paymentMethod: 'CASH', amount: Number(order.balance), provider: 'MOCK' })
      .expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })

    await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(adminA))
      .send({ paymentId: payment.id, amount: 1, reason: 'B40 audit refund' })
      .expect(201)

    const audits = await prisma.auditLog.findMany({
      where: { organizationId: fixture.orgA.organizationId, entityId: payment.id },
    })
    expect(audits.length).toBeGreaterThan(0)
  }, 30000)

  it('a folio financial transaction writes a tenant-scoped audit entry', async () => {
    const folio = await prisma.folio.create({
      data: {
        propertyId: fixture.orgA.propertyId,
        guestId: fixture.orgA.guestId,
        reservationId: fixture.orgA.reservationId,
        folioNumber: `B40-AUDIT-${Date.now()}`,
        balance: 0,
        status: 'OPEN',
      },
    })

    const res = await request(app)
      .post(`/api/folios/${folio.id}/transactions`)
      .set(authHeaders(adminA))
      .send({ type: 'CHARGE', category: 'ROOM', description: 'B40 audited charge', amount: 100 })
      .expect(201)

    const entryId = res.body.data.id
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: fixture.orgA.organizationId, entity: 'FolioTransaction', entityId: entryId },
    })
    expect(audits.length).toBeGreaterThan(0)
    for (const entry of audits) {
      expectNoLeak(JSON.stringify(entry.metadata ?? {}))
    }
  }, 30000)

  it('the audit table is never written with another tenant organizationId for these operations', async () => {
    const order = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    await initiatePayment(app, cashierA, {
      orderId: order.id,
      amount: order.total,
      method: 'CASH',
      provider: 'MOCK',
      organizationId: fixture.orgB.organizationId,
    }).expect(201)

    const payment = await prisma.orderPayment.findFirst({ where: { orderId: order.id } })
    const audits = await prisma.auditLog.findMany({ where: { entityId: payment.id } })
    expect(audits.every((a: any) => a.organizationId === fixture.orgA.organizationId)).toBe(true)
  }, 30000)
})