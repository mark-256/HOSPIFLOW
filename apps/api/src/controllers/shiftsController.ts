import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const shiftsController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { userId, terminalId, status, page, limit } = req.query
    const where: any = {}
    if (userId) where.userId = String(userId)
    if (terminalId) where.terminalId = String(terminalId)
    if (status) where.status = String(status)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({ where, include: { user: true, terminal: true }, orderBy: { openedAt: 'desc' }, skip, take: l }),
      prisma.shift.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(shifts, p, l, total))
  },

  open: async (req: AuthenticatedRequest, res: Response) => {
    const { terminalId, openingBalance } = req.body as any
    if (!terminalId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Terminal is required' } })
    const terminal = await prisma.terminal.findUnique({ where: { id: terminalId }, include: { outlet: true } })
    if (!terminal) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Terminal not found' } })
    const shift = await prisma.shift.create({ data: { outletId: terminal.outletId, terminalId, userId: req.user!.id, openingBalance: parseFloat(openingBalance) || 0 } })
    return res.status(201).json({ success: true, data: shift })
  },

  close: async (req: AuthenticatedRequest, res: Response) => {
    const { closingBalance } = req.body
    const shift = await prisma.shift.update({ where: { id: req.params.id }, data: { status: 'CLOSED', closingBalance: parseFloat(closingBalance) || 0, closedAt: new Date() } })
    return res.json({ success: true, data: shift })
  },
}
