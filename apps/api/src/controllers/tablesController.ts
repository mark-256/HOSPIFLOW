import { Request, Response } from 'express'
import { PrismaClient, TableStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const tablesController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, page, limit } = req.query
    const where: any = { outlet: { property: { organizationId: req.user!.organizationId } } }
    if (outletId) where.outletId = String(outletId)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [tables, total] = await Promise.all([
      prisma.table.findMany({ where, orderBy: { code: 'asc' }, skip, take: l }),
      prisma.table.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(tables, p, l, total))
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, name, code, capacity, positionX, positionY } = req.body as any
    if (!outletId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, name, and code are required' } })
    }
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId, property: { organizationId: req.user!.organizationId } } })
    if (!outlet) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    const table = await prisma.table.create({ data: { propertyId: outlet.propertyId, outletId, name, code, capacity, positionX, positionY, status: TableStatus.AVAILABLE } })
    return res.status(201).json({ success: true, data: table })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const { status, name, capacity } = req.body
    const table = await prisma.table.update({ where: { id: req.params.id, outlet: { property: { organizationId: req.user!.organizationId } } }, data: { status, name, capacity } })
    if (!table) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table not found' } })
    return res.json({ success: true, data: table })
  },
}
