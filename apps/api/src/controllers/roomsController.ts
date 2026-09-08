import { Request, Response } from 'express'
import { PrismaClient, RoomStatus } from '@hospiflow/database'

const prisma = new PrismaClient()

export const roomsController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, status, roomTypeId } = req.query
    const where: any = {}
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (roomTypeId) where.roomTypeId = String(roomTypeId)
    const rooms = await prisma.room.findMany({ where, include: { roomType: true }, orderBy: { roomNumber: 'asc' } })
    return res.json({ success: true, data: rooms })
  },

  create: async (req: Request, res: Response) => {
    const { propertyId, roomTypeId, roomNumber, floor, building, notes } = req.body as any
    if (!propertyId || !roomTypeId || !roomNumber) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, room type, and room number are required' } })
    }
    const room = await prisma.room.create({ data: { propertyId, roomTypeId, roomNumber, floor, building, notes, status: RoomStatus.AVAILABLE } })
    return res.status(201).json({ success: true, data: room })
  },

  update: async (req: Request, res: Response) => {
    const { status, notes } = req.body
    const room = await prisma.room.update({ where: { id: req.params.id }, data: { status, notes } })
    return res.json({ success: true, data: room })
  },
}
