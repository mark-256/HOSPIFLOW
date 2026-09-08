import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const foliosController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, guestId, status } = req.query
    const where: any = {}
    if (propertyId) where.propertyId = String(propertyId)
    if (guestId) where.guestId = String(guestId)
    if (status) where.status = String(status)
    const folios = await prisma.folio.findMany({ where, include: { guest: true, reservation: true, transactions: { orderBy: { createdAt: 'desc' } } }, orderBy: { openedAt: 'desc' } })
    return res.json({ success: true, data: folios })
  },

  get: async (req: Request, res: Response) => {
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id }, include: { guest: true, reservation: true, transactions: { orderBy: { createdAt: 'desc' } } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    return res.json({ success: true, data: folio })
  },

  createTransaction: async (req: Request, res: Response) => {
    const { type, category, description, amount, reference, sourceId, sourceType } = req.body as any
    const folio = await prisma.folio.findUnique({ where: { id: req.params.id } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    const amountNum = parseFloat(amount as any)
    const isDebit = type === 'CHARGE' || type === 'TAX' || type === 'SERVICE_CHARGE'
    const newBalance = isDebit ? Number(folio.balance) + amountNum : Number(folio.balance) - amountNum
    const transaction = await prisma.folioTransaction.create({ data: { folioId: folio.id, type, category, description, amount: amountNum, reference, sourceId, sourceType, createdBy: (req as any).user?.id } })
    await prisma.folio.update({ where: { id: folio.id }, data: { balance: newBalance, totalCharges: isDebit ? Number(folio.totalCharges) + amountNum : Number(folio.totalCharges), totalPayments: !isDebit ? Number(folio.totalPayments) + amountNum : Number(folio.totalPayments) } })
    return res.status(201).json({ success: true, data: transaction })
  },

  close: async (req: Request, res: Response) => {
    const folio = await prisma.folio.update({ where: { id: req.params.id }, data: { status: 'CLOSED', closedAt: new Date() } })
    return res.json({ success: true, data: folio })
  },
}
