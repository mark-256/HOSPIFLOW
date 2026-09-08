import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const shiftsController = {
  list: async (req: Request, res: Response) => {
    const { userId, terminalId, status } = req.query
    const where: any = {}
    if (userId) where.userId = String(userId)
    if (terminalId) where.terminalId = String(terminalId)
    if (status) where.status = String(status)
    const shifts = await prisma.shift.findMany({ where, include: { user: true, terminal: true }, orderBy: { openedAt: 'desc' } })
    return res.json({ success: true, data: shifts })
  },

  open: async (req: Request, res: Response) => {
    const { terminalId, openingBalance } = req.body as any
    if (!terminalId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Terminal is required' } })
    const shift = await prisma.shift.create({ data: { terminalId, userId: (req as any).user?.id, openingBalance: parseFloat(openingBalance) || 0 } as any })
    return res.status(201).json({ success: true, data: shift })
  },

  close: async (req: Request, res: Response) => {
    const { closingBalance } = req.body
    const shift = await prisma.shift.update({ where: { id: req.params.id }, data: { status: 'CLOSED', closingBalance: parseFloat(closingBalance) || 0, closedAt: new Date() } })
    return res.json({ success: true, data: shift })
  },
}
