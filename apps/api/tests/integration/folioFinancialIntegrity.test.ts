import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'

/**
 * B40 — Folio financial integrity (mission §25, §26).
 *
 * Folio transactions are the hotel-side financial ledger. Charges increase the
 * guest's debt, payments/discounts/refunds reduce it, and the balance may never
 * go negative through a credit. Every write must be atomic against concurrent
 * requests and must be attributed to a tenant that owns the folio.
 */

let app: Express
let fixture: SecurityFixture
let prisma: any
let receptionistA: AuthTokens
let adminA: AuthTokens
let adminB: AuthTokens

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  receptionistA = await login(app, fixture.emails.receptionistA, fixture.passwords.receptionistA)
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
  adminB = await login(app, fixture.emails.adminB, fixture.passwords.adminB)
}, 120000)

afterAll(async () => {
  await disconnect()
})

let counter = 0
async function openFolio(balance: number, side: 'orgA' | 'orgB' = 'orgA') {
  const f = fixture[side]
  counter += 1
  return prisma.folio.create({
    data: {
      propertyId: f.propertyId,
      guestId: f.guestId,
      reservationId: f.reservationId,
      folioNumber: `B40-FOLIO-${side}-${Date.now()}-${counter}`,
      balance,
      totalCharges: balance > 0 ? balance : 0,
      status: 'OPEN',
    },
  })
}

function transaction(folioId: string, body: Record<string, unknown>, token: AuthTokens = receptionistA) {
  return request(app)
    .post(`/api/folios/${folioId}/transactions`)
    .set(authHeaders(token))
    .send(body)
}

describe('B40 folio — transaction types and amount validation', () => {
  it('a CHARGE increases the balance and the charge total', async () => {
    const folio = await openFolio(0)
    await transaction(folio.id, { type: 'CHARGE', category: 'ROOM', description: 'B40 charge', amount: 250 }).expect(201)

    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(250)
    expect(Number(after.totalCharges)).toBe(250)
  }, 30000)

  it('a PAYMENT reduces the balance and the payment total', async () => {
    const folio = await openFolio(500)
    await transaction(folio.id, { type: 'PAYMENT', category: 'PAYMENT', description: 'B40 payment', amount: 200 }).expect(201)

    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(300)
    expect(Number(after.totalPayments)).toBe(200)
  }, 30000)

  it('a REFUND credits the balance and the refund total without going negative', async () => {
    const folio = await openFolio(50)
    await transaction(folio.id, { type: 'REFUND', category: 'PAYMENT', description: 'B40 refund', amount: 50 }).expect(201)

    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(0)
    expect(Number(after.totalRefunds)).toBe(50)
  }, 30000)

  it('a REFUND that would drive the balance below zero is refused', async () => {
    const folio = await openFolio(10)
    const res = await transaction(folio.id, { type: 'REFUND', category: 'PAYMENT', description: 'B40 over refund', amount: 50 })
    expect(res.status).toBe(400)
    expect(Number((await prisma.folio.findUnique({ where: { id: folio.id } })).balance)).toBe(10)
  }, 30000)

  it('a DISCOUNT reduces the balance and the discount total', async () => {
    const folio = await openFolio(500)
    await transaction(folio.id, { type: 'DISCOUNT', category: 'DISCOUNT', description: 'B40 discount', amount: 100 }).expect(201)

    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(400)
    expect(Number(after.totalDiscount)).toBe(100)
  }, 30000)

  it('an unknown transaction type is rejected', async () => {
    const folio = await openFolio(100)
    for (const type of ['WRITE_OFF', 'CREDIT', 'ADJUSTMENT', '', 'payment', 42, null, undefined]) {
      const res = await transaction(folio.id, { type, category: 'X', description: 'B40', amount: 10 })
      expect(res.status).toBe(400)
    }
    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(100)
  }, 60000)

  const hostile: Array<[string, unknown]> = [
    ['negative', -100],
    ['negative decimal', -0.01],
    ['non numeric string', 'abc'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['array', [10]],
    ['object', { value: 10 }],
    ['boolean', true],
    ['null', null],
    ['absent', undefined],
    ['absurdly large', '99999999999999999999999999999'],
  ]

  for (const [label, amount] of hostile) {
    it(`a hostile folio amount (${label}) is a 4xx, never an unhandled 500`, async () => {
      const folio = await openFolio(100)
      const res = await transaction(folio.id, { type: 'CHARGE', category: 'ROOM', description: 'B40', amount })
      expect(res.status).toBeLessThan(500)
      expect(res.status).toBeGreaterThanOrEqual(400)
      const after = await prisma.folio.findUnique({ where: { id: folio.id } })
      expect(Number(after.balance)).toBe(100)
      expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(0)
    }, 30000)
  }

  it('a zero transaction is recorded without changing the balance', async () => {
    const folio = await openFolio(100)
    await transaction(folio.id, { type: 'CHARGE', category: 'ROOM', description: 'B40 zero', amount: 0 }).expect(201)
    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(100)
  }, 30000)
})

describe('B40 folio — balance protection', () => {
  it('a payment larger than the balance is refused (no negative balance)', async () => {
    const folio = await openFolio(100)
    const res = await transaction(folio.id, { type: 'PAYMENT', category: 'PAYMENT', description: 'B40 overpay', amount: 100.01 })
    expect(res.status).toBe(400)
    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(100)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(0)
  }, 30000)

  it('a payment of exactly the balance is allowed and settles the folio', async () => {
    const folio = await openFolio(100)
    await transaction(folio.id, { type: 'PAYMENT', category: 'PAYMENT', description: 'B40 exact', amount: 100 }).expect(201)
    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(0)
  }, 30000)

  it('a client cannot post a negative transaction to create a credit', async () => {
    const folio = await openFolio(0)
    const res = await transaction(folio.id, { type: 'PAYMENT', category: 'PAYMENT', description: 'B40 credit', amount: -1000 })
    expect(res.status).toBe(400)
    expect(Number((await prisma.folio.findUnique({ where: { id: folio.id } })).balance)).toBe(0)
  }, 30000)
})

describe('B40 folio — lifecycle and ownership', () => {
  it('a closed folio refuses new transactions', async () => {
    const folio = await openFolio(0)
    await request(app).post(`/api/folios/${folio.id}/close`).set(authHeaders(receptionistA)).expect(200)

    const res = await transaction(folio.id, { type: 'CHARGE', category: 'ROOM', description: 'B40 closed', amount: 10 })
    expect(res.status).toBe(400)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(0)
  }, 30000)

  it('a folio with a non-zero balance cannot be closed', async () => {
    const folio = await openFolio(75)
    const res = await request(app).post(`/api/folios/${folio.id}/close`).set(authHeaders(receptionistA))
    expect(res.status).toBe(400)
    expect((await prisma.folio.findUnique({ where: { id: folio.id } })).status).toBe('OPEN')
  }, 30000)

  it('another tenant cannot post a transaction to this folio', async () => {
    const folio = await openFolio(500)
    const res = await transaction(folio.id, { type: 'CHARGE', category: 'ROOM', description: 'B40 cross tenant', amount: 10 }, adminB)
    expect([403, 404]).toContain(res.status)
    const after = await prisma.folio.findUnique({ where: { id: folio.id } })
    expect(Number(after.balance)).toBe(500)
    expect(await prisma.folioTransaction.count({ where: { folioId: folio.id } })).toBe(0)
  }, 30000)

  it('another tenant cannot read or close this folio', async () => {
    const folio = await openFolio(0)
    const read = await request(app).get(`/api/folios/${folio.id}`).set(authHeaders(adminB))
    expect([403, 404]).toContain(read.status)
    const close = await request(app).post(`/api/folios/${folio.id}/close`).set(authHeaders(adminB))
    expect([403, 404]).toContain(close.status)
    expect((await prisma.folio.findUnique({ where: { id: folio.id } })).status).toBe('OPEN')
  }, 30000)

  it('the folio listing is tenant scoped', async () => {
    const folioA = await openFolio(10)
    const res = await request(app).get('/api/folios').set(authHeaders(adminB)).expect(200)
    expect(res.body.data.map((f: any) => f.id)).not.toContain(folioA.id)
  }, 30000)
})

describe('B40 folio — metadata is not an authorization mechanism', () => {
  it('client-supplied sourceId and sourceType do not change who owns the folio entry', async () => {
    const folio = await openFolio(200)
    await transaction(folio.id, {
      type: 'CHARGE',
      category: 'ROOM',
      description: 'B40 provenance probe',
      amount: 10,
      sourceId: fixture.orgB.orderId,
      sourceType: 'OrderPayment',
      reference: 'client-chosen',
    }).expect(201)

    const entry = await prisma.folioTransaction.findFirst({ where: { folioId: folio.id } })
    const owner = await prisma.folio.findUnique({
      where: { id: entry.folioId },
      include: { property: true },
    })
    expect(owner.property.organizationId).toBe(fixture.orgA.organizationId)
  }, 30000)
})