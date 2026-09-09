import { it, expect } from 'vitest'
import { PrismaClient } from '@hospiflow/database'

it('database client loads', () => {
  const prisma = new PrismaClient()
  expect(prisma).toBeDefined()
})
