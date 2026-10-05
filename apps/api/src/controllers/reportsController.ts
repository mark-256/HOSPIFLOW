import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

/**
 * Parses a user-supplied date. An unparsable or inverted range is a client
 * error, not a crash: returning null lets the caller answer 400 instead of
 * handing an Invalid Date to Prisma.
 */
function parseDateParam(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const reportsController = {
  sales: async (req: AuthenticatedRequest, res: Response) => {
    const { from, to, outletId, page, limit } = req.query
    const where: any = { outlet: { property: { organizationId: req.user!.organizationId } } }
    const fromDate = parseDateParam(from)
    const toDate = parseDateParam(to)
    if ((from !== undefined && fromDate === null) || (to !== undefined && toDate === null)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'from and to must be valid dates' } })
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'from must not be after to' } })
    }
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      }
    }
    if (outletId) where.outletId = String(outletId)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: { items: true, payments: true }, skip, take: l, orderBy: { createdAt: 'desc' } }),
      prisma.order.count({ where }),
    ])
    const totalSales = orders.reduce((sum: number, o: any) => sum + Number(o.total), 0)
    const avgOrderValue = total ? totalSales / total : 0
    const byPayment = orders.flatMap((o: any) => o.payments).reduce((acc: any, p: any) => { acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + Number(p.amount); return acc }, {})
    return res.json({ success: true, data: { totalSales, totalOrders: total, avgOrderValue, byPayment, orders } })
  },

  occupancy: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, date } = req.query
    const parsedDate = parseDateParam(date)
    if (date !== undefined && parsedDate === null) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'date must be a valid date' } })
    }
    const targetDate = parsedDate ?? new Date()
    const rooms = await prisma.room.findMany({ where: { propertyId: String(propertyId), property: { organizationId: req.user!.organizationId } }, include: { reservations: { where: { checkInDate: { lte: targetDate }, checkOutDate: { gte: targetDate } } } } })
    const total = rooms.length
    const occupied = rooms.filter((r: any) => r.reservations.length > 0).length
    const occupancyRate = total ? (occupied / total) * 100 : 0
    return res.json({ success: true, data: { total, occupied, occupancyRate: Math.round(occupancyRate * 100) / 100 } })
  },
}
