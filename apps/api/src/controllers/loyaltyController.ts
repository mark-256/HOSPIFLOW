import { Request, Response } from 'express'
import { PrismaClient, LoyaltyTier } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { requirePermission } from '../middleware/auth'

const prisma = new PrismaClient()

const MAX_POINTS_PER_TRANSACTION = 100000
const TIER_THRESHOLDS: { tier: LoyaltyTier; min: number; max: number }[] = [
  { tier: LoyaltyTier.BRONZE, min: 0, max: 999 },
  { tier: LoyaltyTier.SILVER, min: 1000, max: 4999 },
  { tier: LoyaltyTier.GOLD, min: 5000, max: 19999 },
  { tier: LoyaltyTier.PLATINUM, min: 20000, max: Infinity },
]

function resolveTier(lifetimePoints: number): LoyaltyTier {
  const found = TIER_THRESHOLDS.find(t => lifetimePoints >= t.min && lifetimePoints <= t.max)
  return found ? found.tier : LoyaltyTier.PLATINUM
}

export const loyaltyController = {
  getAccount: async (req: AuthenticatedRequest, res: Response) => {
    const { guestId } = req.query
    if (!guestId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID is required' } })
    const guest = await prisma.guest.findFirst({ where: { id: String(guestId), property: { organizationId: req.user!.organizationId } } })
    if (!guest) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
    const account = await prisma.loyaltyAccount.findFirst({ where: { guestId: String(guestId) }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } })
    if (!account) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Loyalty account not found' } })
    return res.json({ success: true, data: account })
  },

  addPoints: async (req: AuthenticatedRequest, res: Response) => {
    const { guestId, points, reason, reference } = req.body
    if (!guestId || points === undefined || points === null) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID and points are required' } })
    }
    const pointsNum = Math.floor(Number(points))
    if (pointsNum <= 0 || pointsNum > MAX_POINTS_PER_TRANSACTION) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Points must be between 1 and ${MAX_POINTS_PER_TRANSACTION}` } })
    }
    const guest = await prisma.guest.findFirst({ where: { id: guestId, property: { organizationId: req.user!.organizationId } } })
    if (!guest) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
    if (reference) {
      const existing = await prisma.loyaltyTransaction.findFirst({ where: { reference, guestId } })
      if (existing) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Points already awarded for this reference' } })
      }
    }
    const account = await prisma.loyaltyAccount.findFirst({ where: { guestId } })
    if (!account) {
      const newAccount = await prisma.loyaltyAccount.create({ data: { guestId, points: 0, lifetimePoints: 0 } })
      const updated = await prisma.loyaltyAccount.update({ where: { id: newAccount.id }, data: { points: { increment: pointsNum }, lifetimePoints: { increment: pointsNum } } })
      await prisma.loyaltyTransaction.create({ data: { loyaltyAccountId: updated.id, guestId, type: 'EARN', points: pointsNum, reason, reference } })
      return res.json({ success: true, data: updated })
    }
    const updated = await prisma.loyaltyAccount.update({ where: { id: account.id }, data: { points: { increment: pointsNum }, lifetimePoints: { increment: pointsNum } } })
    const newTier = resolveTier(updated.lifetimePoints)
    if (newTier !== account.tier) {
      await prisma.loyaltyAccount.update({ where: { id: account.id }, data: { tier: newTier } })
    }
    await prisma.loyaltyTransaction.create({ data: { loyaltyAccountId: account.id, guestId, type: 'EARN', points: pointsNum, reason, reference } })
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'PAYMENT',
        entity: 'LoyaltyAccount',
        entityId: account.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
      },
    })
    return res.json({ success: true, data: await prisma.loyaltyAccount.findUnique({ where: { id: account.id } }) })
  },
}
