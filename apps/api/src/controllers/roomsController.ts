import { Request, Response } from 'express'
import { PrismaClient, RoomStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const roomsController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, status, roomTypeId, page, limit } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId } }
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (roomTypeId) where.roomTypeId = String(roomTypeId)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [rooms, total] = await Promise.all([
      prisma.room.findMany({ where, include: { roomType: true }, orderBy: { roomNumber: 'asc' }, skip, take: l }),
      prisma.room.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(rooms, p, l, total))
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, roomTypeId, roomNumber, floor, building, notes } = req.body as any
    if (!propertyId || !roomTypeId || !roomNumber) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, room type, and room number are required' } })
    }
    const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId: req.user!.organizationId, deletedAt: null } })
    if (!property) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    const room = await prisma.room.create({ data: { propertyId, roomTypeId, roomNumber, floor, building, notes, status: RoomStatus.AVAILABLE } })
    return res.status(201).json({ success: true, data: room })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const { status, notes } = req.body
    const room = await prisma.room.update({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } }, data: { status, notes } })
    if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } })
    return res.json({ success: true, data: room })
  },
}
