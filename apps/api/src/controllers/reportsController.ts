import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const reportsController = {
  sales: async (req: AuthenticatedRequest, res: Response) => {
    const { from, to, outletId, page, limit } = req.query
    const where: any = {}
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(String(from)) }
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(String(to)) }
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
    const targetDate = date ? new Date(String(date)) : new Date()
    const rooms = await prisma.room.findMany({ where: { propertyId: String(propertyId), property: { organizationId: req.user!.organizationId } }, include: { reservations: { where: { checkInDate: { lte: targetDate }, checkOutDate: { gte: targetDate } } } } })
    const total = rooms.length
    const occupied = rooms.filter((r: any) => r.reservations.length > 0).length
    const occupancyRate = total ? (occupied / total) * 100 : 0
    return res.json({ success: true, data: { total, occupied, occupancyRate: Math.round(occupancyRate * 100) / 100 } })
  },
}
