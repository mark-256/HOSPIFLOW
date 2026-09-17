import { PrismaClient, RoomTypeStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { Response } from 'express'

const prisma = new PrismaClient()

export const roomTypesController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, status } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId, deletedAt: null } }
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    const roomTypes = await prisma.roomType.findMany({
      where,
      include: { property: { select: { id: true, name: true } }, _count: { select: { rooms: true, reservations: true } } },
      orderBy: { name: 'asc' },
    })
    return res.json({ success: true, data: roomTypes })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, name, code, description = '', maxAdults = 1, maxChildren = 0, bedType = 'Queen', amenities = [], basePrice = 0 } = req.body
    if (!propertyId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, name, and code are required' } })
    }
    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId: req.user!.organizationId, deletedAt: null } })
    if (!property) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    try {
      const roomType = await prisma.roomType.create({
        data: { propertyId, name, code, description, maxAdults: Number(maxAdults), maxChildren: Number(maxChildren), bedType, amenities: Array.isArray(amenities) ? amenities : [], basePrice: Number(basePrice), status: RoomTypeStatus.ACTIVE },
      })
      return res.status(201).json({ success: true, data: roomType })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A room type with this code already exists' } })
      }
      throw error
    }
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const roomType = await prisma.roomType.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } }, include: { property: true, rooms: true, ratePlans: true } })
    if (!roomType) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room type not found' } })
    return res.json({ success: true, data: roomType })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.roomType.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room type not found' } })
    const { name, code, description, maxAdults, maxChildren, bedType, amenities, basePrice, status } = req.body
    try {
      const roomType = await prisma.roomType.update({
        where: { id: existing.id },
        data: {
          ...(name && { name }), ...(code && { code }), ...(description !== undefined && { description }),
          ...(maxAdults !== undefined && { maxAdults: Number(maxAdults) }), ...(maxChildren !== undefined && { maxChildren: Number(maxChildren) }),
          ...(bedType && { bedType }), ...(amenities && { amenities }), ...(basePrice !== undefined && { basePrice: Number(basePrice) }), ...(status && { status }),
        },
      })
      return res.json({ success: true, data: roomType })
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A room type with this code already exists' } })
      }
      throw error
    }
  },

  remove: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.roomType.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room type not found' } })
    await prisma.roomType.update({ where: { id: existing.id }, data: { status: RoomTypeStatus.INACTIVE } })
    return res.json({ success: true, data: { message: 'Room type deactivated' } })
  },
}
