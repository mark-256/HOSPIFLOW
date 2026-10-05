import { Response } from 'express'
import { PrismaClient, HousekeepingStatus } from '@hospiflow/database'
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

export const housekeepingController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, status, roomId } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId } }
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (roomId) where.roomId = String(roomId)
    const tasks = await prisma.housekeepingTask.findMany({ where, include: { room: true, assignedTo: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: tasks })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, roomId, type, priority, assignedToId, notes } = req.body
    if (!propertyId || !roomId || !type) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, room, and type are required' } })
    }
    const property = await prisma.property.findFirst({
      where: { id: String(propertyId), organizationId: req.user!.organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!property) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    const room = await prisma.room.findFirst({
      where: { id: String(roomId), propertyId: property.id },
      select: { id: true },
    })
    if (!room) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } })
    const validatedAssignee = await resolveAssignee(assignedToId, req.user!.organizationId)
    if (validatedAssignee === null) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assignee not found in this organization' } })
    }
    const task = await prisma.housekeepingTask.create({ data: { propertyId: property.id, roomId: room.id, type, priority: priority ?? 'NORMAL', assignedToId: validatedAssignee ?? undefined, notes, status: HousekeepingStatus.PENDING } })
    return res.status(201).json({ success: true, data: task })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const { status, notes, assignedToId } = req.body
    const existing = await prisma.housekeepingTask.findFirst({
      where: { id: req.params.id, property: { organizationId: req.user!.organizationId } },
    })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Housekeeping task not found' } })
    const validatedAssignee = await resolveAssignee(assignedToId, req.user!.organizationId)
    if (validatedAssignee === null) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assignee not found in this organization' } })
    }
    const data: any = { status, notes, assignedToId: validatedAssignee }
    if (status === HousekeepingStatus.COMPLETED) data.completedAt = new Date()
    if (status === HousekeepingStatus.VERIFIED) data.verifiedAt = new Date()
    const task = await prisma.housekeepingTask.update({ where: { id: existing.id }, data })
    return res.json({ success: true, data: task })
  },
}
