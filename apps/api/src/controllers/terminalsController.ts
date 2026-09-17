import { PrismaClient, TerminalStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { Response } from 'express'

const prisma = new PrismaClient()

export const terminalsController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, status } = req.query
    const where: any = { outlet: { property: { organizationId: req.user!.organizationId } } }
    if (outletId) where.outletId = String(outletId)
    if (status) where.status = String(status)
    const terminals = await prisma.terminal.findMany({ where, include: { outlet: { select: { id: true, name: true, code: true } } }, orderBy: { name: 'asc' } })
    return res.json({ success: true, data: terminals })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, name, code, status = 'ACTIVE' } = req.body
    if (!outletId || !name || !code) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, name, and code are required' } })
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId, property: { organizationId: req.user!.organizationId } } })
    if (!outlet) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    try {
      const terminal = await prisma.terminal.create({ data: { outletId, name, code, status: status || TerminalStatus.ACTIVE } })
      return res.status(201).json({ success: true, data: terminal })
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A terminal with this code already exists' } })
      throw error
    }
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const terminal = await prisma.terminal.findFirst({ where: { id: req.params.id, outlet: { property: { organizationId: req.user!.organizationId } } }, include: { outlet: true, shifts: true, cashDrawers: true } })
    if (!terminal) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Terminal not found' } })
    return res.json({ success: true, data: terminal })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.terminal.findFirst({ where: { id: req.params.id, outlet: { property: { organizationId: req.user!.organizationId } } } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Terminal not found' } })
    const { name, code, status } = req.body
    try {
      const terminal = await prisma.terminal.update({ where: { id: existing.id }, data: { ...(name && { name }), ...(code && { code }), ...(status && { status }) } })
      return res.json({ success: true, data: terminal })
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A terminal with this code already exists' } })
      throw error
    }
  },

  remove: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.terminal.findFirst({ where: { id: req.params.id, outlet: { property: { organizationId: req.user!.organizationId } } } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Terminal not found' } })
    await prisma.terminal.update({ where: { id: existing.id }, data: { status: TerminalStatus.MAINTENANCE } })
    return res.json({ success: true, data: { message: 'Terminal deactivated' } })
  },
}
