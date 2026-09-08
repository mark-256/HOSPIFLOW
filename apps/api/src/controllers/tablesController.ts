import { Request, Response } from 'express'
import { PrismaClient, TableStatus } from '@hospiflow/database'

const prisma = new PrismaClient()

export const tablesController = {
  list: async (req: Request, res: Response) => {
    const { outletId } = req.query
    const where = outletId ? { outletId: String(outletId) } : {}
    const tables = await prisma.table.findMany({ where, orderBy: { code: 'asc' } })
    return res.json({ success: true, data: tables })
  },

  create: async (req: Request, res: Response) => {
    const { outletId, name, code, capacity, positionX, positionY } = req.body as any
    if (!outletId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, name, and code are required' } })
    }
    const table = await prisma.table.create({ data: { propertyId: (req as any).user?.organizationId || outletId, outletId, name, code, capacity, positionX, positionY, status: TableStatus.AVAILABLE } })
    return res.status(201).json({ success: true, data: table })
  },

  update: async (req: Request, res: Response) => {
    const { status, name, capacity } = req.body
    const table = await prisma.table.update({ where: { id: req.params.id }, data: { status, name, capacity } })
    return res.json({ success: true, data: table })
  },
}
