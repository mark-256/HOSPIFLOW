import { Request, Response } from 'express'
import { PrismaClient, ReservationStatus } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()
type TransactionClient = Parameters<typeof prisma.$transaction>[0] extends (tx: infer T) => Promise<any> ? T : never

export const reservationsController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, status, from, to, page, limit } = req.query
    const where: any = {}
    if (propertyId) where.propertyId = String(propertyId)
    if (status) where.status = String(status)
    if (from) where.checkInDate = { ...where.checkInDate, gte: new Date(String(from)) }
    if (to) where.checkOutDate = { ...where.checkOutDate, lte: new Date(String(to)) }
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({ where, include: { guest: true, roomType: true, room: true }, orderBy: { checkInDate: 'desc' }, skip, take: l }),
      prisma.reservation.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(reservations, p, l, total))
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, guestId, roomTypeId, roomId, checkInDate, checkOutDate, adults, children, ratePlanId, rate, depositAmount, depositPaid, specialRequests, source, notes } = req.body as any
    if (!propertyId || !guestId || !roomTypeId || !checkInDate || !checkOutDate || !adults) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } })
    }
    const checkIn = new Date(checkInDate)
    const checkOut = new Date(checkOutDate)
    if (checkIn >= checkOut) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Check-out must be after check-in' } })
    }
    const confirmationCode = `RES-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    const reservation = await prisma.$transaction(async (tx: TransactionClient) => {
      if (roomId) {
        const overlapping = await tx.reservation.findFirst({
          where: {
            roomId,
            status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.CHECKED_IN] },
            OR: [
              { checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } },
            ],
          },
        })
        if (overlapping) {
          throw new Error('Room is already booked for the selected dates')
        }
      }
      return tx.reservation.create({
        data: { propertyId, guestId, roomTypeId, roomId, confirmationCode, checkInDate: checkIn, checkOutDate: checkOut, adults, children: children ?? 0, ratePlanId, rate: rate ? parseFloat(rate) : 0, depositAmount: depositAmount ? parseFloat(depositAmount) : null, depositPaid: depositPaid ?? false, specialRequests, source, notes },
      })
    })
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'RESERVATION_CREATED',
        entity: 'Reservation',
        entityId: reservation.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
      },
    })
    return res.status(201).json({ success: true, data: reservation })
  },

  get: async (req: Request, res: Response) => {
    const reservation = await prisma.reservation.findFirst({ where: { id: req.params.id }, include: { guest: true, roomType: true, room: true, folios: true } })
    if (!reservation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Reservation not found' } })
    return res.json({ success: true, data: reservation })
  },

  updateStatus: async (req: AuthenticatedRequest, res: Response) => {
    const { status, roomId } = req.body
    const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
      [ReservationStatus.PENDING]: [ReservationStatus.CONFIRMED, ReservationStatus.CANCELLED],
      [ReservationStatus.CONFIRMED]: [ReservationStatus.CHECKED_IN, ReservationStatus.CANCELLED],
      [ReservationStatus.CHECKED_IN]: [ReservationStatus.CHECKED_OUT, ReservationStatus.CANCELLED],
      [ReservationStatus.CHECKED_OUT]: [],
      [ReservationStatus.CANCELLED]: [],
      [ReservationStatus.NO_SHOW]: [],
    }
    const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } })
    if (!reservation) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Reservation not found' } })
    const currentStatus = reservation.status as ReservationStatus
    const nextStatus = status as ReservationStatus
    if (!Object.values(ReservationStatus).includes(nextStatus)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status value' } })
    }
    const allowed = allowedTransitions[currentStatus] || []
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Cannot transition from ${currentStatus} to ${nextStatus}` } })
    }
    const data: any = { status: nextStatus }
    if (nextStatus === ReservationStatus.CHECKED_IN) {
      data.checkedInAt = new Date()
      if (roomId) data.roomId = roomId
    }
    if (nextStatus === ReservationStatus.CHECKED_OUT) data.checkedOutAt = new Date()
    if (nextStatus === ReservationStatus.CANCELLED) data.cancelledAt = new Date()
    const updated = await prisma.reservation.update({ where: { id: reservation.id }, data })
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: nextStatus === ReservationStatus.CHECKED_IN ? 'CHECK_IN' : nextStatus === ReservationStatus.CHECKED_OUT ? 'CHECK_OUT' : nextStatus === ReservationStatus.CANCELLED ? 'RESERVATION_CANCELLED' : 'RESERVATION_MODIFIED',
        entity: 'Reservation',
        entityId: reservation.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
      },
    })
    return res.json({ success: true, data: updated })
  },
}
