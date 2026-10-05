import { Response } from 'express'
import { PrismaClient, MaintenanceStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

/**
 * Resolves a client-supplied assignee to a user inside the caller's
 * organization. Returns the validated id, `null` for an explicit clear, and
 * `undefined` when the caller supplied no assignee at all.
 */
async function resolveAssignee(assignedToId: unknown, organizationId: string): Promise<string | null | undefined> {
  if (assignedToId === undefined) return undefined
  if (assignedToId === null || assignedToId === '') return null
  const assignee = await prisma.user.findFirst({
    where: { id: String(assignedToId), organizationId, deletedAt: null },
    select: { id: true },
  })
  return assignee ? assignee.id : null
}

export const maintenanceController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, status, roomId } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId } }
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (roomId) where.roomId = String(roomId)
    const tickets = await prisma.maintenanceTicket.findMany({ where, include: { room: true, assignedTo: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: tickets })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, roomId, title, description, priority, category, assignedToId } = req.body
    if (!propertyId || !title || !description) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, title, and description are required' } })
    }
    const property = await prisma.property.findFirst({
      where: { id: String(propertyId), organizationId: req.user!.organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!property) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    let validatedRoomId: string | undefined
    if (roomId) {
      const room = await prisma.room.findFirst({
        where: { id: String(roomId), propertyId: property.id },
        select: { id: true },
      })
      if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } })
      validatedRoomId = room.id
    }
    const validatedAssignee = await resolveAssignee(assignedToId, req.user!.organizationId)
    if (validatedAssignee === null) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assignee not found in this organization' } })
    }
    const ticket = await prisma.maintenanceTicket.create({ data: { propertyId: property.id, roomId: validatedRoomId, title, description, priority: priority ?? 'MEDIUM', category, assignedToId: validatedAssignee ?? undefined, status: MaintenanceStatus.OPEN } })
    return res.status(201).json({ success: true, data: ticket })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const { status, title, description, notes, assignedToId, resolvedAt } = req.body
    const existing = await prisma.maintenanceTicket.findFirst({
      where: { id: req.params.id, property: { organizationId: req.user!.organizationId } },
    })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Maintenance ticket not found' } })
    const validatedAssignee = await resolveAssignee(assignedToId, req.user!.organizationId)
    if (validatedAssignee === null) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assignee not found in this organization' } })
    }
    const data: any = { status, title, description, notes, assignedToId: validatedAssignee }
    if (status === MaintenanceStatus.RESOLVED || status === MaintenanceStatus.CLOSED) data.resolvedAt = resolvedAt ? new Date(resolvedAt) : new Date()
    const ticket = await prisma.maintenanceTicket.update({ where: { id: existing.id }, data })
    return res.json({ success: true, data: ticket })
  },
}
