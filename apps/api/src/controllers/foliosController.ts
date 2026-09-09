import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

function toDecimal(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Invalid monetary value')
  }
  return Math.round(num * 100) / 100
}

export const foliosController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, guestId, status, page, limit } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId } }
    if (propertyId) where.propertyId = String(propertyId)
    if (guestId) where.guestId = String(guestId)
    if (status) where.status = String(status)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [folios, total] = await Promise.all([
      prisma.folio.findMany({ where, include: { guest: true, reservation: true, transactions: { orderBy: { createdAt: 'desc' } } }, orderBy: { openedAt: 'desc' }, skip, take: l }),
      prisma.folio.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(folios, p, l, total))
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } }, include: { guest: true, reservation: true, transactions: { orderBy: { createdAt: 'desc' } } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    return res.json({ success: true, data: folio })
  },

  createTransaction: async (req: AuthenticatedRequest, res: Response) => {
    const { type, category, description, amount, reference, sourceId, sourceType } = req.body as any
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    if (folio.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Cannot add transactions to a closed folio' } })
    }
    const amountNum = toDecimal(amount)
    const isDebit = type === 'CHARGE' || type === 'TAX' || type === 'SERVICE_CHARGE' || type === 'DISCOUNT'
    const currentBalance = Math.round(Number(folio.balance) * 100) / 100
    const newBalance = isDebit ? Math.round((currentBalance + amountNum) * 100) / 100 : Math.round((currentBalance - amountNum) * 100) / 100
    if (!isDebit && newBalance < 0) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Payment would result in negative folio balance' } })
    }
    const transaction = await prisma.folioTransaction.create({ data: { folioId: folio.id, type, category, description, amount: amountNum, reference, sourceId, sourceType, createdBy: req.user?.id } })
    const updateData: any = { balance: newBalance }
    if (isDebit) {
      updateData.totalCharges = { increment: amountNum }
      if (type === 'DISCOUNT') {
        updateData.totalDiscount = { increment: amountNum }
      }
    } else {
      updateData.totalPayments = { increment: amountNum }
      if (type === 'REFUND') {
        updateData.totalRefunds = { increment: amountNum }
      }
    }
    await prisma.folio.update({ where: { id: folio.id }, data: updateData })
    return res.status(201).json({ success: true, data: transaction })
  },

  close: async (req: AuthenticatedRequest, res: Response) => {
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    const balance = Math.round(Number(folio.balance) * 100) / 100
    if (balance !== 0) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Folio balance is ${balance}. Please settle before closing.` } })
    }
    const closed = await prisma.folio.update({ where: { id: folio.id }, data: { status: 'CLOSED', closedAt: new Date() } })
    return res.json({ success: true, data: closed })
  },
}
