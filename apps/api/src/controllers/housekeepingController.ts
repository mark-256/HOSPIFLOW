import { Request, Response } from 'express'
import { PrismaClient, HousekeepingStatus } from '@hospiflow/database'

const prisma = new PrismaClient()

export const housekeepingController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, status, roomId } = req.query
    const where: any = {}
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (roomId) where.roomId = String(roomId)
    const tasks = await prisma.housekeepingTask.findMany({ where, include: { room: true, assignedTo: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: tasks })
  },

  create: async (req: Request, res: Response) => {
    const { propertyId, roomId, type, priority, assignedToId, notes } = req.body
    if (!propertyId || !roomId || !type) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, room, and type are required' } })
    }
    const task = await prisma.housekeepingTask.create({ data: { propertyId, roomId, type, priority: priority ?? 'NORMAL', assignedToId, notes, status: HousekeepingStatus.PENDING } })
    return res.status(201).json({ success: true, data: task })
  },

  update: async (req: Request, res: Response) => {
    const { status, notes, assignedToId } = req.body
    const data: any = { status, notes, assignedToId }
    if (status === HousekeepingStatus.COMPLETED) data.completedAt = new Date()
    if (status === HousekeepingStatus.VERIFIED) data.verifiedAt = new Date()
    const task = await prisma.housekeepingTask.update({ where: { id: req.params.id }, data })
    return res.json({ success: true, data: task })
  },
}
