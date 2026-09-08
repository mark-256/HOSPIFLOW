import { Request, Response } from 'express'
import { PrismaClient, OrderStatus, OrderType, PaymentMethod } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const ordersController = {
  list: async (req: Request, res: Response) => {
    const { outletId, status, tableId, from, to } = req.query
    const where: any = {}
    if (outletId) where.outletId = String(outletId)
    if (status) where.status = String(status)
    if (tableId) where.tableId = String(tableId)
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(String(from)) }
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(String(to)) }
    const orders = await prisma.order.findMany({ where, include: { items: { include: { modifiers: true } }, payments: true, table: true, guest: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: orders })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, tableId, orderType, guestId, customerName, customerPhone, roomNumber, covers, notes } = req.body as any
    if (!outletId || !orderType) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet and order type are required' } })
    }
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`
    const order = await prisma.order.create({
      data: { outletId, tableId, orderNumber, orderType: orderType as OrderType, guestId, customerName, customerPhone, roomNumber, covers: covers ? parseInt(covers) : null, notes, createdBy: (req as any).user?.id },
    })
    return res.status(201).json({ success: true, data: order })
  },

  get: async (req: Request, res: Response) => {
    const order = await prisma.order.findFirst({ where: { id: req.params.id }, include: { items: { include: { modifiers: true } }, payments: true, table: true, guest: true } })
    if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    return res.json({ success: true, data: order })
  },

  updateStatus: async (req: Request, res: Response) => {
    const { status } = req.body
    const data: any = { status }
    if (status === OrderStatus.SENT_TO_KITCHEN) data.sentToKitchenAt = new Date()
    if (status === OrderStatus.COMPLETED) data.completedAt = new Date()
    if (status === OrderStatus.CANCELLED) data.cancelledAt = new Date()
    const order = await prisma.order.update({ where: { id: req.params.id }, data })
    return res.json({ success: true, data: order })
  },

  addItem: async (req: AuthenticatedRequest, res: Response) => {
    const { productId, productName, productCode, quantity, unitPrice, notes } = req.body
    const order = await prisma.order.findUnique({ where: { id: req.params.id } })
    if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    const total = parseFloat(unitPrice as any) * parseInt(quantity as any)
    const item = await prisma.orderItem.create({ data: { orderId: order.id, productId, productName, productCode, quantity: parseInt(quantity), unitPrice: parseFloat(unitPrice), total } })
    await prisma.order.update({ where: { id: order.id }, data: { subtotal: Number(order.subtotal) + total, total: Number(order.total) + total, balance: Number(order.balance) + total } })
    return res.status(201).json({ success: true, data: item })
  },

  pay: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentMethod, amount, reference, provider } = req.body
    const order = await prisma.order.findUnique({ where: { id: req.params.id } })
    if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    const amountNum = parseFloat(amount as any)
    if (amountNum > Number(order.balance)) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Amount exceeds balance' } })
    const payment = await prisma.orderPayment.create({ data: { orderId: order.id, paymentMethod: paymentMethod as PaymentMethod, amount: amountNum, reference, provider, status: 'COMPLETED', paidAt: new Date() } })
    const newPaidAmount = Number(order.paidAmount) + amountNum
    const newBalance = Number(order.total) - newPaidAmount
    await prisma.order.update({ where: { id: order.id }, data: { paidAmount: newPaidAmount, balance: newBalance } })
    return res.status(201).json({ success: true, data: payment })
  },
}
