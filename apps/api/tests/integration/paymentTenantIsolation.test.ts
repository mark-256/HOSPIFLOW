import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { applyProviderWebhook } from '../../src/services/paymentWebhookService'
import { createOrderWithItems, initiatePayment, mpesaCallback, payOrder, simulateMpesaAnchor, toMinor } from './helpers/b40Financial'

/**
 * B40 — Financial tenant isolation (mission §31, §32).
 *
 * Two fully-populated tenants exist: Order A / Payment A / Folio A / Refund A and
 * the mirror image in Organization B. Every cross-tenant combination is
 * attempted across the payment, order, folio, refund and webhook surfaces.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let adminA: AuthTokens
let adminB: AuthTokens
let cashierA: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
  cashierA = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

let paymentA: any
let paymentB: any
let orderA: any
let orderB: any

beforeAll(async () => {
  orderA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
  orderB = await createOrderWithItems(app, adminB, fixture.orgB.outletId, fixture.orgB.productId)

  await request(app)
    .post(`/api/orders/${orderA.id}/pay`)
    .set(authHeaders(cashierA))
    .send({ paymentMethod: 'CASH', amount: orderA.total, provider: 'MOCK' })
    .expect(201)
  await request(app)
    .post(`/api/orders/${orderB.id}/pay`)
    .set(authHeaders(adminB))
    .send({ paymentMethod: 'CASH', amount: orderB.total, provider: 'MOCK' })
    .expect(201)

  paymentA = await prisma.orderPayment.findFirst({ where: { orderId: orderA.id } })
  paymentB = await prisma.orderPayment.findFirst({ where: { orderId: orderB.id } })
}, 120000)

describe('B40 financial tenant isolation — payment access', () => {
  it('the two tenants have genuinely distinct financial fixtures', async () => {
    expect(fixture.orgA.organizationId).not.toBe(fixture.orgB.organizationId)
    expect(paymentA.id).not.toBe(paymentB.id)
    expect(fixture.orgA.folioId).not.toBe(fixture.orgB.folioId)
  })

  it('org A cannot read org B payment', async () => {
    const res = await request(app).get(`/api/payments/${paymentB.id}`).set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
    expect(JSON.stringify(res.body)).not.toContain(paymentB.id)
  })

  it('org A cannot read org B payment metadata or provider identifiers', async () => {
    await prisma.orderPayment.update({
      where: { id: paymentB.id },
      data: { metadata: { checkoutRequestId: 'b40_secret_anchor_b' }, reference: 'b40-ref-b' },
    })

    const list = await request(app).get('/api/payments').set(authHeaders(adminA)).expect(200)
    const body = JSON.stringify(list.body)
    expect(body).not.toContain('b40_secret_anchor_b')
    expect(body).not.toContain('b40-ref-b')

    const single = await request(app).get(`/api/payments/${paymentB.id}`).set(authHeaders(adminA))
    expect([403, 404]).toContain(single.status)
    expect(JSON.stringify(single.body)).not.toContain('b40_secret_anchor_b')
  })

  it('org A cannot verify org B payment', async () => {
    const res = await request(app).post('/api/payments/verify').set(authHeaders(adminA)).send({ paymentId: paymentB.id })
    expect([403, 404]).toContain(res.status)
    expect((await prisma.orderPayment.findUnique({ where: { id: paymentB.id } })).status).toBe('COMPLETED')
  })

  it('org A cannot refund org B payment', async () => {
    const res = await request(app)
      .post('/api/payments/refund')
      .set(authHeaders(adminA))
      .send({ paymentId: paymentB.id, amount: 1, reason: 'B40 cross tenant refund' })
    expect([403, 404]).toContain(res.status)
    expect(await prisma.refund.count({ where: { paymentId: paymentB.id } })).toBe(0)
    expect((await prisma.orderPayment.findUnique({ where: { id: paymentB.id } })).status).toBe('COMPLETED')
  })

  it('org A cannot pay org B order', async () => {
    const before = await prisma.order.findUnique({ where: { id: orderB.id } })
    const res = await request(app)
      .post(`/api/orders/${orderB.id}/pay`)
      .set(authHeaders(adminA))
      .send({ paymentMethod: 'CASH', amount: 1, provider: 'MOCK' })
    expect([403, 404]).toContain(res.status)
    expect(Number((await prisma.order.findUnique({ where: { id: orderB.id } })).paidAmount)).toBe(Number(before.paidAmount))
  })

  it('org A cannot initiate a payment against org B order', async () => {
    const res = await initiatePayment(app, adminA, {
      orderId: orderB.id,
      amount: 1,
      method: 'CASH',
      provider: 'MOCK',
    })
    expect([403, 404]).toContain(res.status)
    expect(await prisma.orderPayment.count({ where: { orderId: orderB.id, id: { not: paymentB.id } } })).toBe(0)
  })

  it('org A cannot read or post to org B folio', async () => {
    const read = await request(app).get(`/api/folios/${fixture.orgB.folioId}`).set(authHeaders(adminA))
    expect([403, 404]).toContain(read.status)

    const post = await request(app)
      .post(`/api/folios/${fixture.orgB.folioId}/transactions`)
      .set(authHeaders(adminA))
      .send({ type: 'CHARGE', category: 'ROOM', description: 'B40 cross', amount: 10 })
    expect([403, 404]).toContain(post.status)
    expect(await prisma.folioTransaction.count({ where: { folioId: fixture.orgB.folioId, description: 'B40 cross' } })).toBe(0)
  })

  it('org A cannot close org B folio', async () => {
    const res = await request(app).post(`/api/folios/${fixture.orgB.folioId}/close`).set(authHeaders(adminA))
    expect([403, 404]).toContain(res.status)
    expect((await prisma.folio.findUnique({ where: { id: fixture.orgB.folioId } })).status).toBe('OPEN')
  })

  it('a client-supplied organizationId never widens the payment list', async () => {
    for (const query of [
      { organizationId: fixture.orgB.organizationId },
      { propertyId: fixture.orgB.propertyId },
      { outletId: fixture.orgB.outletId },
      { orderId: orderB.id },
    ]) {
      const res = await request(app).get('/api/payments').query(query).set(authHeaders(adminA)).expect(200)
      expect(res.body.data.map((p: any) => p.id)).not.toContain(paymentB.id)
    }
  })
})

describe('B40 financial tenant isolation — webhooks', () => {
  it('an org A callback cannot settle an org B payment', async () => {
    await initiatePayment(app, adminB, {
      orderId: orderB.id,
      amount: 1,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const victim = await prisma.orderPayment.findFirst({ where: { orderId: orderB.id, status: 'PENDING' } })
    const anchor = `b40_tenant_anchor_${victim.id}`
    await simulateMpesaAnchor(prisma, victim.id, anchor)

    const before = await prisma.orderPayment.findUnique({ where: { id: victim.id } })

    // A callback body that tries to carry tenant context is ignored: the resolver
    // derives the organization from the payment's own order.
    const res = await applyProviderWebhook('M-Pesa', {
      id: anchor,
      status: 'SUCCEEDED',
      reference: 'QJG0000B40',
      checkoutRequestId: anchor,
      amount: 1,
      currency: 'KES',
      provider: 'MPESA',
      method: 'MPESA',
      createdAt: new Date(),
      organizationId: fixture.orgA.organizationId,
    })

    expect(res.status).toBe(200)
    const after = await prisma.orderPayment.findUnique({
      where: { id: victim.id },
      include: { order: { include: { outlet: { include: { property: true } } } } },
    })
    expect(after.order.outlet.property.organizationId).toBe(fixture.orgB.organizationId)
    expect(after.status).not.toBe('COMPLETED')
    expect(after.paidAt).toBe(before.paidAt)
  }, 30000)

  it('an org B callback settles only the org B payment it names', async () => {
    const orgBOrder = await createOrderWithItems(app, adminB, fixture.orgB.outletId, fixture.orgB.productId)
    await initiatePayment(app, adminB, {
      orderId: orgBOrder.id,
      amount: orgBOrder.total,
      method: 'MPESA',
      provider: 'MOCK',
    }).expect(201)
    const payment = await prisma.orderPayment.findFirst({ where: { orderId: orgBOrder.id } })
    const anchor = `b40_tenant_ok_${payment.id}`
    await simulateMpesaAnchor(prisma, payment.id, anchor)

    await applyProviderWebhook(
      'M-Pesa',
      await new (await import('../../src/services/payments/mpesa')).MpesaProvider().handleWebhook(
        mpesaCallback(anchor, toMinor(orgBOrder.total))
      )
    )

    const settled = await prisma.orderPayment.findUnique({ where: { id: payment.id } })
    expect(settled.status).toBe('COMPLETED')

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'OrderPayment', entityId: payment.id, action: 'PAYMENT' },
    })
    expect(audits.every((a: any) => a.organizationId === fixture.orgB.organizationId)).toBe(true)
  }, 30000)
})

describe('B40 financial tenant isolation — outlet scope', () => {
  it('a payment cannot be attached to an order of another outlet', async () => {
    const orderOutletA = await createOrderWithItems(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const orderOutletB = await createOrderWithItems(app, adminB, fixture.orgB.outletId, fixture.orgB.productId)

    const res = await initiatePayment(app, cashierA, {
      orderId: orderOutletB.id,
      amount: orderOutletB.total,
      method: 'CASH',
      provider: 'MOCK',
      outletId: fixture.orgA.outletId,
    })
    expect([403, 404]).toContain(res.status)

    const attached = await prisma.orderPayment.findFirst({ where: { orderId: orderOutletB.id } })
    expect(attached).toBeNull()
  }, 30000)

  it('two tenants settling the same nominal amount keep entirely separate ledgers', async () => {
    const pA = await payOrder(app, cashierA, fixture.orgA.outletId, fixture.orgA.productId)
    const pB = await payOrder(app, adminB, fixture.orgB.outletId, fixture.orgB.productId)

    const orderOfA = await prisma.order.findUnique({ where: { id: pA.orderId }, include: { outlet: { include: { property: true } } } })
    const orderOfB = await prisma.order.findUnique({ where: { id: pB.orderId }, include: { outlet: { include: { property: true } } } })

    expect(orderOfA.outlet.property.organizationId).toBe(fixture.orgA.organizationId)
    expect(orderOfB.outlet.property.organizationId).toBe(fixture.orgB.organizationId)
    expect(Number(orderOfA.paidAmount)).toBe(Number(pA.amount))
    expect(Number(orderOfB.paidAmount)).toBe(Number(pB.amount))
  }, 30000)
})