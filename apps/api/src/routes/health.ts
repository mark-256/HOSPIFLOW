import { Router } from 'express'
import { PrismaClient } from '@hospiflow/database'

const router = Router()
const prisma = new PrismaClient()

router.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    })
  } catch {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection failed',
      },
    })
  }
})

router.get('/ready', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ready',
      timestamp: new Date().toISOString(),
    },
  })
})

export default router
