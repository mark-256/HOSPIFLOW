import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@hospiflow/database'
import app from '../src/app'

const prisma = new PrismaClient()
let apiApp: any
let token: string

beforeAll(async () => {
  apiApp = app
  const org = await prisma.organization.upsert({ where: { slug: 'test-org' }, update: {}, create: { name: 'Test Org', slug: 'test-org' } })
  const role = await prisma.appRole.upsert({ where: { organizationId_name: { organizationId: org.id, name: 'ORG_ADMIN' } }, update: {}, create: { organizationId: org.id, name: 'ORG_ADMIN', isSystem: true } })
  const user = await prisma.user.upsert({ where: { organizationId_email: { organizationId: org.id, email: 'test@hospiflow.com' } }, update: {}, create: { organizationId: org.id, roleId: role.id, email: 'test@hospiflow.com', passwordHash: 'hash', firstName: 'Test', lastName: 'User' } })
  const res = await request(app).post('/api/auth/login').send({ email: 'test@hospiflow.com', password: 'password' })
  token = res.body.data.token
})

describe('Guests API', () => {
  it('should list guests', async () => {
    const res = await request(app).get('/api/guests').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('should create a guest', async () => {
    const res = await request(app).post('/api/guests').set('Authorization', `Bearer ${token}`).send({ propertyId: 'test', firstName: 'John', lastName: 'Doe' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })
})
