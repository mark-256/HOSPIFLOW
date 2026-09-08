import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const menusController = {
  list: async (req: Request, res: Response) => {
    const { outletId } = req.query
    const where = outletId ? { outletId: String(outletId) } : {}
    const menus = await prisma.menu.findMany({ where, include: { categories: { include: { products: true } } } })
    return res.json({ success: true, data: menus })
  },

  create: async (req: Request, res: Response) => {
    const { outletId, name, code, description, startTime, endTime } = req.body
    if (!outletId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, name, and code are required' } })
    }
    const menu = await prisma.menu.create({ data: { outletId, name, code, description, startTime: startTime ? new Date(startTime) : undefined, endTime: endTime ? new Date(endTime) : undefined } })
    return res.status(201).json({ success: true, data: menu })
  },
}
