import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const guestPortalController = {
  getReservations: async (req: Request, res: Response) => {
    const { guestId } = req.query
    if (!guestId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID is required' } })
    const reservations = await prisma.reservation.findMany({ where: { guestId: String(guestId) }, include: { roomType: true, room: true }, orderBy: { checkInDate: 'desc' } })
    return res.json({ success: true, data: reservations })
  },

  getFolios: async (req: Request, res: Response) => {
    const { guestId } = req.query
    if (!guestId) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Guest ID is required' } })
    const folios = await prisma.folio.findMany({ where: { guestId: String(guestId) }, include: { transactions: { orderBy: { createdAt: 'desc' } } }, orderBy: { openedAt: 'desc' } })
    return res.json({ success: true, data: folios })
  },
}
