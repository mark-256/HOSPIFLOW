import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const loyaltyController = {
  getAccount: async (req: Request, res: Response) => {
    const { guestId } = req.query
    if (!guestId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID is required' } })
    const account = await prisma.loyaltyAccount.findFirst({ where: { guestId: String(guestId) }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } })
    if (!account) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Loyalty account not found' } })
    return res.json({ success: true, data: account })
  },

  addPoints: async (req: Request, res: Response) => {
    const { guestId, points, reason, reference } = req.body
    if (!guestId || !points) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID and points are required' } })
    let account = await prisma.loyaltyAccount.findFirst({ where: { guestId } })
    if (!account) {
      account = await prisma.loyaltyAccount.create({ data: { guestId, points: 0, lifetimePoints: 0 } })
    }
    account = await prisma.loyaltyAccount.update({ where: { id: account.id }, data: { points: account.points + points, lifetimePoints: account.lifetimePoints + points } })
    await prisma.loyaltyTransaction.create({ data: { loyaltyAccountId: account.id, guestId, type: 'EARN', points, reason, reference } })
    return res.json({ success: true, data: account })
  },
}
