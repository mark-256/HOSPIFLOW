import { describe, it, expect } from 'vitest'
import { PrismaClient } from '@hospiflow/database'

const TEST_DB_URL = process.env.DATABASE_TEST_URL || ''

function parseDbUrl(url: string): { host: string; port: string; db: string } | null {
  try {
    const u = new URL(url.replace(/^postgres/, 'postgresql'))
    return {
      host: u.hostname,
      port: u.port || '5432',
      db: u.pathname.replace(/^\//, '').replace(/\?.*$/, ''),
    }
  } catch {
    return null
  }
}

describe('B38 — Test Database Isolation', () => {
  it('DATABASE_TEST_URL must be configured', () => {
    expect(TEST_DB_URL).toBeTruthy()
    expect(TEST_DB_URL.length).toBeGreaterThan(0)
  })

  it('test database name must not be the development database name (hospiflow)', () => {
    const testParsed = parseDbUrl(TEST_DB_URL)
    expect(testParsed).not.toBeNull()
    if (testParsed) {
      expect(testParsed.db).not.toBe('hospiflow')
      expect(testParsed.db.toLowerCase()).toMatch(/test/)
    }
  })

  it('DATABASE_URL must point to the test database during test runs', () => {
    const devUrl = process.env.DATABASE_URL || ''
    expect(devUrl).toBe(TEST_DB_URL)
  })

  it('test database must be reachable', async () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    })
    try {
      await prisma.$queryRaw`SELECT 1`
      expect(true).toBe(true)
    } catch {
      expect.fail('Could not connect to test database')
    } finally {
      await prisma.$disconnect()
    }
  }, 15000)

  it('test database must have expected schema tables', async () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    })
    try {
      const result = await prisma.$queryRaw<
        Array<{ tablename: string }>
      >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%' LIMIT 5`
      expect(result.length).toBeGreaterThan(0)
    } finally {
      await prisma.$disconnect()
    }
  }, 15000)
})
