import { PrismaClient } from '@hospiflow/database'
import { TEST_DB_URL } from './testEnv'
import { seedTestData } from './seed'

export const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
})

export async function resetDatabase(): Promise<void> {
  let attempts = 0
  const maxAttempts = 5
  while (attempts < maxAttempts) {
    try {
      const result = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
      const tables = result
        .filter(({ tablename }) => !tablename.startsWith('_prisma'))
        .map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`)
        .join(', ')
      if (tables) {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
      }
      return
    } catch (err: any) {
      if (err?.message?.includes('deadlock') && attempts < maxAttempts - 1) {
        attempts++
        await new Promise((r) => setTimeout(r, 200))
        continue
      }
      throw err
    }
  }
}

export async function seedDatabase() {
  return seedTestData(prisma)
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}

export type { SeedData } from './seed'
