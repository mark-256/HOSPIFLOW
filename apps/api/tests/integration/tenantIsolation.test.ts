import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'

let app: Express
let seedData: any

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('Tenant Isolation Integration Tests', () => {
  let orgAAdminTokens: AuthTokens
  let orgBAdminTokens: AuthTokens

  beforeAll(async () => {
    orgAAdminTokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
    orgBAdminTokens = await login(app, seedData.orgB.users.ORG_ADMIN.email, seedData.orgB.users.ORG_ADMIN.password)
  }, 60000)

  it('Organization A user can list their own organizations', async () => {
    const res = await request(app)
      .get('/api/organizations')
      .set(authHeaders(orgAAdminTokens))
      .expect(200)

    const orgs = res.body.data
    const ownOrg = orgs.find((o: any) => o.id === seedData.orgA.organizationId)
    const otherOrg = orgs.find((o: any) => o.id === seedData.orgB.organizationId)
    expect(ownOrg).toBeDefined()
    expect(otherOrg).not.toBeDefined()
  })

  it('Organization B user can list their own organizations', async () => {
    const res = await request(app)
      .get('/api/organizations')
      .set(authHeaders(orgBAdminTokens))
      .expect(200)

    const orgs = res.body.data
    const ownOrg = orgs.find((o: any) => o.id === seedData.orgB.organizationId)
    const otherOrg = orgs.find((o: any) => o.id === seedData.orgA.organizationId)
    expect(ownOrg).toBeDefined()
    expect(otherOrg).not.toBeDefined()
  })

  it('Org A user cannot access Org B properties', async () => {
    const res = await request(app)
      .get(`/api/properties/${seedData.orgB.propertyId}`)
      .set(authHeaders(orgAAdminTokens))
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  it('Org A user cannot access Org B rooms', async () => {
    const res = await request(app)
      .get('/api/rooms')
      .set(authHeaders(orgAAdminTokens))
      .query({ propertyId: seedData.orgB.propertyId })
      .expect(200)

    const rooms = res.body.data
    expect(rooms.length).toBe(0)
  })

  it('Org B user cannot access Org A guests', async () => {
    const res = await request(app)
      .get('/api/guests')
      .set(authHeaders(orgBAdminTokens))
      .query({ propertyId: seedData.orgA.propertyId })
      .expect(200)

    const guests = res.body.data
    expect(guests.length).toBe(0)
  })

  it('Cross-tenant reservation access denied', async () => {
    const res = await request(app)
      .get('/api/reservations')
      .set(authHeaders(orgAAdminTokens))
      .query({ propertyId: seedData.orgB.propertyId })
      .expect(200)

    const reservations = res.body.data
    expect(reservations.length).toBe(0)
  })

  it('Cross-tenant order access denied', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeaders(orgBAdminTokens))
      .send({ outletId: seedData.orgB.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const orderId = orderRes.body.data.id

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(authHeaders(orgAAdminTokens))
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  it('Cross-tenant folio access denied', async () => {
    const res = await request(app)
      .get('/api/folios')
      .set(authHeaders(orgAAdminTokens))
      .expect(200)

    const folios = res.body.data
    const orgBFolios = folios.filter((f: any) => f.property?.organizationId === seedData.orgB.organizationId)
    expect(orgBFolios.length).toBe(0)
  })

  it('Cross-tenant payment access denied', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeaders(orgBAdminTokens))
      .send({ outletId: seedData.orgB.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const order = orderRes.body.data

    await request(app)
      .post(`/api/orders/${order.id}/items`)
      .set(authHeaders(orgBAdminTokens))
      .send({ productId: seedData.orgB.productId, quantity: 1 })
      .expect(201)

    await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set(authHeaders(orgBAdminTokens))
      .send({ paymentMethod: 'CASH', amount: 8.50, provider: 'MOCK' })
      .expect(201)

    const paymentsRes = await request(app)
      .get('/api/payments')
      .set(authHeaders(orgAAdminTokens))
      .expect(200)

    const paymentIds = paymentsRes.body.data.map((p: any) => p.id)
    expect(paymentIds.length).toBe(0)
  })

  it('Cross-tenant inventory access denied', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set(authHeaders(orgAAdminTokens))
      .query({ organizationId: seedData.orgB.organizationId })
      .expect(200)

    const items = res.body.data
    expect(items.length).toBe(0)
  })

  it('Org A user cannot update Org B property', async () => {
    const res = await request(app)
      .patch(`/api/properties/${seedData.orgB.propertyId}`)
      .set(authHeaders(orgAAdminTokens))
      .send({ name: 'Hacked Property' })
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  it('Org B user cannot access Org A order', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeaders(orgBAdminTokens))
      .send({ outletId: seedData.orgB.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const res = await request(app)
      .get(`/api/orders/${orderRes.body.data.id}`)
      .set(authHeaders(orgAAdminTokens))
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  it('Both orgs see isolated data in shared tables', async () => {
    const resA = await request(app).get('/api/rooms').set(authHeaders(orgAAdminTokens)).expect(200)
    const resB = await request(app).get('/api/rooms').set(authHeaders(orgBAdminTokens)).expect(200)

    const roomsA = resA.body.data
    const roomsB = resB.body.data

    const roomIdsA = roomsA.map((r: any) => r.id)
    const roomIdsB = roomsB.map((r: any) => r.id)

    expect(roomIdsA.length).toBe(2)
    expect(roomIdsB.length).toBe(1)

    const intersection = roomIdsA.filter((id: string) => roomIdsB.includes(id))
    expect(intersection.length).toBe(0)
  })
})
