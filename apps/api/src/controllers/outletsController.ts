import { PrismaClient, OutletStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { Response } from 'express'

const prisma = new PrismaClient()

export const outletsController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, type, status } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId, deletedAt: null } }
    if (propertyId) where.propertyId = String(propertyId)
    if (type) where.type = String(type)
    if (status) where.status = String(status)
    const outlets = await prisma.outlet.findMany({
      where,
      include: { property: { select: { id: true, name: true, code: true } }, _count: { select: { tables: true, menus: true, orders: true } } },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: outlets })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, name, code, type = 'RESTAURANT', status = 'ACTIVE' } = req.body
    if (!propertyId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, name, and code are required' } })
    }
    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId: req.user!.organizationId, deletedAt: null } })
    if (!property) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    try {
      const outlet = await prisma.outlet.create({
        data: { propertyId, name, code, type, status: status || OutletStatus.ACTIVE },
        include: { property: { select: { id: true, name: true } } },
      })
      return res.status(201).json({ success: true, data: outlet })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'An outlet with this code already exists' } })
      }
      throw error
    }
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const outlet = await prisma.outlet.findFirst({
      where: { id: req.params.id, property: { organizationId: req.user!.organizationId, deletedAt: null } },
      include: { property: true, tables: true, menus: true, terminals: true },
    })
    if (!outlet) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    return res.json({ success: true, data: outlet })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.outlet.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    const { name, code, type, status } = req.body
    try {
      const outlet = await prisma.outlet.update({
        where: { id: existing.id },
        data: { ...(name && { name }), ...(code && { code }), ...(type && { type }), ...(status && { status }) },
      })
      return res.json({ success: true, data: outlet })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'An outlet with this code already exists' } })
      }
      throw error
    }
  },

  remove: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.outlet.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    await prisma.outlet.update({ where: { id: existing.id }, data: { deletedAt: new Date(), status: OutletStatus.INACTIVE } })
    return res.json({ success: true, data: { message: 'Outlet deactivated' } })
  },
}
