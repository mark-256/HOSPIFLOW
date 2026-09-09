import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { Express } from 'express'

let app: Express
let seedData: any
let tokens: AuthTokens

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
  tokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('Authentication Integration Tests', () => {
  it('login success returns 200 with token and user data', async () => {
    expect(tokens.token).toBeDefined()
    expect(tokens.refreshToken).toBeDefined()
    expect(tokens.user.id).toBeDefined()
    expect(tokens.user.email).toBe(seedData.orgA.users.ORG_ADMIN.email)
    expect(tokens.user.organization.id).toBe(seedData.orgA.organizationId)
    expect(tokens.user.permissions).toContain('orders_create')
    expect(tokens.user.permissions).toContain('payments_process')
  })

  it('login failure with wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: seedData.orgA.users.ORG_ADMIN.email, password: 'wrongpassword' })
      .expect(401)

    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('login failure with nonexistent email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@testorga.com', password: 'Admin@123!' })
      .expect(401)

    expect(res.body.success).toBe(false)
  })

  it('login with missing credentials returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(400)

    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('login with missing password returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: seedData.orgA.users.ORG_ADMIN.email })
      .expect(400)

    expect(res.body.success).toBe(false)
  })

  it('authenticated /api/auth/me returns user data', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeaders(tokens))
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.email).toBe(seedData.orgA.users.ORG_ADMIN.email)
  })

  it('unauthenticated /api/auth/me returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .expect(401)

    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('missing bearer token returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', '')
      .expect(401)

    expect(res.body.success).toBe(false)
  })

  it('invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401)

    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })

  it('logout clears session', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set(authHeaders(tokens))
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.message).toContain('Logged out')
  })

  it('password hash is not returned in response', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: seedData.orgA.users.RECEPTIONIST.email, password: 'Recep@123!' })
      .expect(200)

    const responseStr = JSON.stringify(loginRes.body)
    expect(responseStr).not.toContain('passwordHash')
    expect(responseStr).not.toContain('password')
  })

  it('user email is unique within organization', async () => {
    const { prisma } = await import('./helpers/testDb.js')
    const existing = await prisma.user.findFirst({
      where: { email: seedData.orgA.users.ORG_ADMIN.email },
    })
    expect(existing).toBeTruthy()

    const duplicate = await prisma.user.findMany({
      where: { email: seedData.orgA.users.ORG_ADMIN.email },
    })
    expect(duplicate.length).toBe(1)
  })
})
