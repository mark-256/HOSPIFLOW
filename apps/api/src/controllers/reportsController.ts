import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const reportsController = {
  sales: async (req: Request, res: Response) => {
    const { from, to, outletId } = req.query
    const where: any = {}
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(String(from)) }
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(String(to)) }
    if (outletId) where.outletId = String(outletId)
    const orders = await prisma.order.findMany({ where, include: { items: true, payments: true } })
    const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0)
    const totalOrders = orders.length
    const avgOrderValue = totalOrders ? totalSales / totalOrders : 0
    const byPayment = orders.flatMap(o => o.payments).reduce((acc: any, p) => { acc[p.paymentMethod] = (acc[p.paymentMethod] || 0) + Number(p.amount); return acc }, {})
    return res.json({ success: true, data: { totalSales, totalOrders, avgOrderValue, byPayment, orders } })
  },

  occupancy: async (req: Request, res: Response) => {
    const { propertyId, date } = req.query
    const targetDate = date ? new Date(String(date)) : new Date()
    const rooms = await prisma.room.findMany({ where: { propertyId: String(propertyId) }, include: { reservations: { where: { checkInDate: { lte: targetDate }, checkOutDate: { gte: targetDate } } } } })
    const total = rooms.length
    const occupied = rooms.filter(r => r.reservations.length > 0).length
    const occupancyRate = total ? (occupied / total) * 100 : 0
    return res.json({ success: true, data: { total, occupied, occupancyRate: Math.round(occupancyRate * 100) / 100 } })
  },
}
