import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { PrismaClient } from '@hospiflow/database'
import app from '../src/app'

const prisma = new PrismaClient()
let apiApp: any

beforeAll(() => {
  apiApp = app
})

describe('Auth API', () => {
  it('should return 404 for health when db is unavailable', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(503)
  })

  it('should reject login without credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })
})
