import { Request, Response } from 'express'
import { PrismaClient, MaintenanceStatus } from '@hospiflow/database'

const prisma = new PrismaClient()

export const maintenanceController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, status, roomId } = req.query
    const where: any = {}
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (roomId) where.roomId = String(roomId)
    const tickets = await prisma.maintenanceTicket.findMany({ where, include: { room: true, assignedTo: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: tickets })
  },

  create: async (req: Request, res: Response) => {
    const { propertyId, roomId, title, description, priority, category, assignedToId } = req.body
    if (!propertyId || !title || !description) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, title, and description are required' } })
    }
    const ticket = await prisma.maintenanceTicket.create({ data: { propertyId, roomId, title, description, priority: priority ?? 'MEDIUM', category, assignedToId, status: MaintenanceStatus.OPEN } })
    return res.status(201).json({ success: true, data: ticket })
  },

  update: async (req: Request, res: Response) => {
    const { status, title, description, notes, assignedToId, resolvedAt } = req.body
    const data: any = { status, title, description, notes, assignedToId }
    if (status === MaintenanceStatus.RESOLVED || status === MaintenanceStatus.CLOSED) data.resolvedAt = resolvedAt ? new Date(resolvedAt) : new Date()
    const ticket = await prisma.maintenanceTicket.update({ where: { id: req.params.id }, data })
    return res.json({ success: true, data: ticket })
  },
}
