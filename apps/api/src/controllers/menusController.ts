import { Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const menusController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId } = req.query
    const where: any = { outlet: { property: { organizationId: req.user!.organizationId } } }
    if (outletId) where.outletId = String(outletId)
    const menus = await prisma.menu.findMany({ where, include: { categories: { include: { products: true } } } })
    return res.json({ success: true, data: menus })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, name, code, description, startTime, endTime } = req.body
    if (!outletId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, name, and code are required' } })
    }
    const outlet = await prisma.outlet.findFirst({
      where: { id: String(outletId), property: { organizationId: req.user!.organizationId } },
      select: { id: true },
    })
    if (!outlet) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    const menu = await prisma.menu.create({ data: { outletId: outlet.id, name, code, description, startTime: startTime ? new Date(startTime) : undefined, endTime: endTime ? new Date(endTime) : undefined } })
    return res.status(201).json({ success: true, data: menu })
  },
}
