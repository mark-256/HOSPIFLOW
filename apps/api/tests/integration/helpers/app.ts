import type { Express } from 'express'
import { prisma, resetDatabase, seedDatabase } from './testDb'

let _app: Express | null = null
let _seedData: any = null

export async function getApp(): Promise<Express> {
  if (!_app) {
    const mod = await import('../../../src/app.js')
    _app = mod.default as unknown as Express
  }
  return _app!
}

export async function setupTestDatabase(): Promise<any> {
  await resetDatabase()
  _seedData = await seedDatabase()
  return _seedData
}

export function getSeedData(): any {
  return _seedData
}

export async function getPrisma() {
  return prisma
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}
