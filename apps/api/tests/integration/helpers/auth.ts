import { Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export interface AuthTokens {
  token: string
  refreshToken: string
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    permissions: string[]
    organization: { id: string; name: string }
  }
}

export async function login(app: Express, email: string, password: string): Promise<AuthTokens> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200)

  if (!res.body.success) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`)
  }

  return res.body.data
}

export async function loginAs(app: Express, email: string, password: string): Promise<AuthTokens> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })

  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }

  return res.body.data
}

export async function loginAsAdmin(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgA.users.ORG_ADMIN
  return login(app, email, password)
}

export async function loginAsReceptionist(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgA.users.RECEPTIONIST
  return login(app, email, password)
}

export async function loginAsCashier(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgA.users.CASHIER
  return login(app, email, password)
}

export async function loginAsWaiter(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgA.users.WAITER
  return login(app, email, password)
}

export async function loginAsChef(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgA.users.CHEF
  return login(app, email, password)
}

export async function loginAsSuperAdmin(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgA.users.SUPER_ADMIN
  return login(app, email, password)
}

export async function loginAsOrgBAdmin(app: Express, seedData: any): Promise<AuthTokens> {
  const { email, password } = seedData.orgB.users.ORG_ADMIN
  return login(app, email, password)
}

export function authHeaders(tokens: AuthTokens): { Authorization: string } {
  return { Authorization: `Bearer ${tokens.token}` }
}
