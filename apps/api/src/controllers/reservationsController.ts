import { Request, Response } from 'express'
import { PrismaClient, ReservationStatus } from '@hospiflow/database'

const prisma = new PrismaClient()

export const reservationsController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, status, from, to } = req.query
    const where: any = {}
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (from) where.checkInDate = { ...where.checkInDate, gte: new Date(String(from)) }
    if (to) where.checkOutDate = { ...where.checkOutDate, lte: new Date(String(to)) }
    const reservations = await prisma.reservation.findMany({ where, include: { guest: true, roomType: true, room: true }, orderBy: { checkInDate: 'desc' } })
    return res.json({ success: true, data: reservations })
  },

  create: async (req: Request, res: Response) => {
    const { propertyId, guestId, roomTypeId, roomId, checkInDate, checkOutDate, adults, children, ratePlanId, rate, depositAmount, depositPaid, specialRequests, source, notes } = req.body as any
    if (!propertyId || !guestId || !roomTypeId || !checkInDate || !checkOutDate || !adults) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } })
    }
    const confirmationCode = `RES-${Date.now().toString(36).toUpperCase()}`
    const reservation = await prisma.reservation.create({
      data: { propertyId, guestId, roomTypeId, roomId, confirmationCode, checkInDate: new Date(checkInDate), checkOutDate: new Date(checkOutDate), adults, children: children ?? 0, ratePlanId, rate: rate ? parseFloat(rate) : 0, depositAmount: depositAmount ? parseFloat(depositAmount) : null, depositPaid: depositPaid ?? false, specialRequests, source, notes },
    })
    return res.status(201).json({ success: true, data: reservation })
  },

  get: async (req: Request, res: Response) => {
    const reservation = await prisma.reservation.findFirst({ where: { id: req.params.id }, include: { guest: true, roomType: true, room: true, folios: true } })
    if (!reservation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Reservation not found' } })
    return res.json({ success: true, data: reservation })
  },

  updateStatus: async (req: Request, res: Response) => {
    const { status, roomId } = req.body
    const data: any = { status }
    if (status === ReservationStatus.CHECKED_IN) data.checkedInAt = new Date()
    if (status === ReservationStatus.CHECKED_OUT) data.checkedOutAt = new Date()
    if (status === ReservationStatus.CANCELLED) data.cancelledAt = new Date()
    if (roomId) data.roomId = roomId
    const reservation = await prisma.reservation.update({ where: { id: req.params.id }, data })
    return res.json({ success: true, data: reservation })
  },
}
