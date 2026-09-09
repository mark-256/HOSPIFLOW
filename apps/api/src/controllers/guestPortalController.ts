import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const guestPortalController = {
  getReservations: async (req: AuthenticatedRequest, res: Response) => {
    const guestId = req.query.guestId ? String(req.query.guestId) : null
    if (!guestId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID is required' } })
    }
    const guest = await prisma.guest.findFirst({
      where: {
        id: guestId,
        property: { organizationId: req.user!.organizationId },
      },
    })
    if (!guest) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
    }
    const reservations = await prisma.reservation.findMany({
      where: { guestId, property: { organizationId: req.user!.organizationId } },
      include: { roomType: true, room: true },
      orderBy: { checkInDate: 'desc' },
    })
    return res.json({ success: true, data: reservations })
  },

  getFolios: async (req: AuthenticatedRequest, res: Response) => {
    const guestId = req.query.guestId ? String(req.query.guestId) : null
    if (!guestId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID is required' } })
    }
    const guest = await prisma.guest.findFirst({
      where: {
        id: guestId,
        property: { organizationId: req.user!.organizationId },
      },
    })
    if (!guest) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
    }
    const folios = await prisma.folio.findMany({
      where: { guestId, property: { organizationId: req.user!.organizationId } },
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
      orderBy: { openedAt: 'desc' },
    })
    return res.json({ success: true, data: folios })
  },
}
