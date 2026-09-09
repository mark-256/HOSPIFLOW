export * from './generated/index'
import { PrismaClient } from './generated/client'

const prisma = new PrismaClient()

export default prisma
