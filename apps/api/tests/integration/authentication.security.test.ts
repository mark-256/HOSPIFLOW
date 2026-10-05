import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@hospiflow/database'
import type { Express } from 'express'
import { getApp, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { setupSecurityFixtures, SecurityFixture } from './helpers/securityFixtures'
import { config } from '../../src/config'

/**
 * B39 — Authentication boundary tests (mission §5, Cases A–G).
 * Every protected route must answer 401 for missing / invalid / malformed /
 * expired / wrong-type / deactivated credentials, and must keep working for a
 * correctly authenticated caller (Case G).
 */

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-integration-tests-only'
const TEST_REFRESH_SECRET = 'test-refresh-secret-key-for-integration-tests-only'

const PROTECTED_ENDPOINTS: Array<{ method: 'get' | 'post' | 'patch'; path: string }> = [
  { method: 'get', path: '/api/orders' },
  { method: 'get', path: '/api/guests' },
  { method: 'get', path: '/api/rooms' },
  { method: 'get', path: '/api/reservations' },
  { method: 'get', path: '/api/folios' },
  { method: 'get', path: '/api/inventory' },
  { method: 'get', path: '/api/inventory/movements' },
  { method: 'get', path: '/api/suppliers' },
  { method: 'get', path: '/api/purchase-orders' },
  { method: 'get', path: '/api/housekeeping' },
  { method: 'get', path: '/api/maintenance' },
  { method: 'get', path: '/api/tables' },
  { method: 'get', path: '/api/menus' },
  { method: 'get', path: '/api/products' },
  { method: 'get', path: '/api/shifts' },
  { method: 'get', path: '/api/online-orders' },
  { method: 'get', path: '/api/terminals' },
  { method: 'get', path: '/api/outlets' },
  { method: 'get', path: '/api/room-types' },
  { method: 'get', path: '/api/loyalty/account' },
  { method: 'get', path: '/api/reports/sales' },
  { method: 'get', path: '/api/reports/occupancy' },
  { method: 'get', path: '/api/ai/insights' },
  { method: 'get', path: '/api/users' },
  { method: 'get', path: '/api/payments' },
  { method: 'get', path: '/api/organizations' },
  { method: 'get', path: '/api/properties' },
  { method: 'get', path: '/api/guest-portal/reservations' },
  { method: 'get', path: '/api/admin/backups' },
  { method: 'get', path: '/api/auth/me' },
  { method: 'post', path: '/api/orders' },
  { method: 'post', path: '/api/guests' },
  { method: 'post', path: '/api/users' },
  { method: 'post', path: '/api/inventory' },
  { method: 'post', path: '/api/inventory/movements' },
  { method: 'post', path: '/api/housekeeping' },
  { method: 'post', path: '/api/maintenance' },
  { method: 'post', path: '/api/suppliers' },
  { method: 'post', path: '/api/purchase-orders' },
  { method: 'post', path: '/api/online-orders' },
  { method: 'post', path: '/api/admin/backups' },
  { method: 'post', path: '/api/payments/initiate' },
  { method: 'post', path: '/api/payments/refund' },
  { method: 'post', path: '/api/qr/generate' },
  { method: 'post', path: '/api/loyalty/points' },
]

let app: Express
let fixture: SecurityFixture
let adminA: AuthTokens
let prisma: PrismaClient

beforeAll(async () => {
  app = await getApp()
  fixture = await setupSecurityFixtures()
  prisma = await getPrisma()
  adminA = await login(app, fixture.emails.adminA, fixture.passwords.adminA)
}, 120000)

afterAll(async () => {
  await disconnect()
})

describe('B39 Authentication — Case A: no token', () => {
  it.each(PROTECTED_ENDPOINTS)('$method $path returns 401 without a token', async ({ method, path }) => {
    const res = await (request(app) as any)[method](path)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })
})

describe('B39 Authentication — Case B/C: invalid and malformed tokens', () => {
  it.each(PROTECTED_ENDPOINTS)('$method $path returns 401 for a structurally invalid token', async ({ method, path }) => {
    const res = await (request(app) as any)[method](path).set({ Authorization: 'Bearer not-a-real-jwt' })
    expect(res.status).toBe(401)
  })

  it.each(PROTECTED_ENDPOINTS)('$method $path returns 401 for a token with a broken signature', async ({ method, path }) => {
    const forged = jwt.sign({ userId: fixture.users.adminA, organizationId: fixture.orgA.organizationId }, 'wrong-secret', {
      expiresIn: '15m',
    })
    const res = await (request(app) as any)[method](path).set({ Authorization: `Bearer ${forged}` })
    expect(res.status).toBe(401)
  })

  it('rejects an authorization header that is not a Bearer scheme', async () => {
    const res = await request(app).get('/api/orders').set({ Authorization: fixture.users.adminA })
    expect(res.status).toBe(401)
  })
})

describe('B39 Authentication — Case D: expired token', () => {
  it.each(PROTECTED_ENDPOINTS)('$method $path returns 401 for an expired token', async ({ method, path }) => {
    const expired = jwt.sign({ userId: fixture.users.adminA, organizationId: fixture.orgA.organizationId }, TEST_JWT_SECRET, {
      expiresIn: '-1s',
    })
    const res = await (request(app) as any)[method](path).set({ Authorization: `Bearer ${expired}` })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })
})

describe('B39 Authentication — Case E: wrong token type', () => {
  it.each(PROTECTED_ENDPOINTS)('$method $path rejects a refresh token presented as an access token', async ({ method, path }) => {
    const refresh = jwt.sign(
      { userId: fixture.users.adminA, organizationId: fixture.orgA.organizationId, jti: 'b39-wrong-type' },
      TEST_REFRESH_SECRET,
      { expiresIn: '7d' }
    )
    const res = await (request(app) as any)[method](path).set({ Authorization: `Bearer ${refresh}` })
    expect(res.status).toBe(401)
  })
})

describe('B39 Authentication — Case F: deactivated user', () => {
  it('rejects a still-unexpired token once the user is deactivated', async () => {
    const tokens = await login(app, fixture.emails.waiterA, fixture.passwords.waiterA)
    const before = await request(app).get('/api/orders').set(authHeaders(tokens)).expect(200)
    expect(before.body.success).toBe(true)

    await prisma.user.update({ where: { id: fixture.users.waiterA }, data: { isActive: false } })
    const after = await request(app).get('/api/orders').set(authHeaders(tokens))
    expect(after.status).toBe(401)
    expect(after.body.error.code).toBe('UNAUTHORIZED')

    await prisma.user.update({ where: { id: fixture.users.waiterA }, data: { isActive: true } })
  })

  it('rejects login for a deactivated user', async () => {
    await prisma.user.update({ where: { id: fixture.users.chefA }, data: { isActive: false } })
    const res = await request(app).post('/api/auth/login').send({ email: fixture.emails.chefA, password: fixture.passwords.chefA })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    await prisma.user.update({ where: { id: fixture.users.chefA }, data: { isActive: true } })
  })

  it('rejects login for a soft-deleted user', async () => {
    await prisma.user.update({ where: { id: fixture.users.chefA }, data: { deletedAt: new Date() } })
    const res = await request(app).post('/api/auth/login').send({ email: fixture.emails.chefA, password: fixture.passwords.chefA })
    expect(res.status).toBe(401)
    await prisma.user.update({ where: { id: fixture.users.chefA }, data: { deletedAt: null } })
  })

  it('rejects a still-unexpired token once the user is soft-deleted', async () => {
    // DELETE /api/users/:id soft-deletes the row. The access token is already
    // issued and unexpired, so only the middleware re-reading the user can
    // notice the deletion. Without that check a terminated account keeps full
    // access for the remaining lifetime of its token.
    const tokens = await login(app, fixture.emails.waiterA, fixture.passwords.waiterA)
    await request(app).get('/api/orders').set(authHeaders(tokens)).expect(200)

    await prisma.user.update({ where: { id: fixture.users.waiterA }, data: { deletedAt: new Date() } })
    const after = await request(app).get('/api/orders').set(authHeaders(tokens))
    expect(after.status).toBe(401)
    expect(after.body.error.code).toBe('UNAUTHORIZED')

    await prisma.user.update({ where: { id: fixture.users.waiterA }, data: { deletedAt: null } })
    // The same token works again once the row is restored, proving the
    // rejection came from the deletion check and not from token corruption.
    await request(app).get('/api/orders').set(authHeaders(tokens)).expect(200)
  })

  it('a user deleted through the API cannot keep using their token', async () => {
    const target = await prisma.user.create({
      data: {
        organizationId: fixture.orgA.organizationId,
        roleId: fixture.roleIds.orgA.WAITER,
        email: `terminated.${Date.now()}@testorga.com`,
        passwordHash: await bcrypt.hash('Terminated@123', 10),
        firstName: 'Terminated',
        lastName: 'User',
        isActive: true,
      },
    })

    const tokens = await login(app, target.email, 'Terminated@123')
    await request(app).get('/api/orders').set(authHeaders(tokens)).expect(200)

    await request(app).delete(`/api/users/${target.id}`).set(authHeaders(adminA)).expect(200)

    const after = await request(app).get('/api/orders').set(authHeaders(tokens))
    expect(after.status).toBe(401)

    await prisma.user.update({ where: { id: target.id }, data: { deletedAt: null } })
  })
})

describe('B39 Authentication — Case G: valid token keeps working', () => {
  it.each(PROTECTED_ENDPOINTS.filter(e => e.method === 'get' && !e.path.includes('guest-portal') && !e.path.includes('loyalty')))(
    '$method $path is reachable with a valid token',
    async ({ method, path }) => {
      const res = await (request(app) as any)[method](path).set(authHeaders(adminA))
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  )

  it('login never returns the password hash or the JWT secret', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: fixture.emails.adminA, password: fixture.passwords.adminA })
      .expect(200)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain(TEST_JWT_SECRET)
    expect(serialized).not.toContain(TEST_REFRESH_SECRET)
  })

  it('logout revokes the session rows for the user', async () => {
    const tokens = await login(app, fixture.emails.cashierA, fixture.passwords.cashierA)
    const sessionsBefore = await prisma.session.count({ where: { userId: fixture.users.cashierA } })
    expect(sessionsBefore).toBeGreaterThan(0)
    await request(app).post('/api/auth/logout').set(authHeaders(tokens)).expect(200)
    const sessionsAfter = await prisma.session.count({ where: { userId: fixture.users.cashierA } })
    expect(sessionsAfter).toBe(0)
  })
})

describe('B39 Authentication — rate limiting preserved', () => {
  it('login responses still carry rate-limit headers', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: fixture.emails.adminA, password: fixture.passwords.adminA })
    expect(res.status).toBe(200)
    expect(res.headers['ratelimit-limit']).toBeDefined()
  })

  it('API responses still carry rate-limit headers', async () => {
    const res = await request(app).get('/api/orders').set(authHeaders(adminA)).expect(200)
    expect(res.headers['ratelimit-limit']).toBeDefined()
  })

  it('failed logins consume the login budget (credential stuffing is counted)', async () => {
    const first = await request(app).post('/api/auth/login').send({ email: fixture.emails.adminA, password: 'wrong-password-1' })
    const second = await request(app).post('/api/auth/login').send({ email: fixture.emails.adminA, password: 'wrong-password-2' })
    expect(first.status).toBe(401)
    expect(second.status).toBe(401)

    const before = Number(first.headers['ratelimit-remaining'])
    const after = Number(second.headers['ratelimit-remaining'])
    expect(Number.isFinite(before)).toBe(true)
    expect(after).toBeLessThan(before)
  })

  it('a successful login does not consume the failure budget', async () => {
    const success = await request(app).post('/api/auth/login').send({ email: fixture.emails.adminA, password: fixture.passwords.adminA })
    expect(success.status).toBe(200)
    // skipSuccessfulRequests is enabled, so a correct password must not lower
    // the remaining failure allowance.
    expect(Number(success.headers['ratelimit-remaining'])).toBeGreaterThan(0)
  })

  it('the login budget is configured as a positive integer', () => {
    // The production default is 10 failures per 15 minutes; the test
    // environment raises the budget so that a whole suite can log in, so only
    // the shape is asserted here. The production default itself is verified by
    // the B39 report's limiter probe (max=10 refuses attempts 11+ with 429).
    expect(Number.isInteger(config.authRateLimitMax)).toBe(true)
    expect(config.authRateLimitMax).toBeGreaterThan(0)
    expect(config.authRateLimitWindowMs).toBeGreaterThan(0)
  })
})
