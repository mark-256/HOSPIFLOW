import { Request, Response } from 'express'
import { PrismaClient, OrderType } from '@hospiflow/database'

const prisma = new PrismaClient()

export const onlineOrdersController = {
  list: async (req: Request, res: Response) => {
    const { outletId, status } = req.query
    const where: any = { orderType: 'DELIVERY' }
    if (outletId) where.outletId = String(outletId)
    if (status) where.status = String(status)
    const orders = await prisma.order.findMany({ where, include: { items: true, guest: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: orders })
  },

  create: async (req: Request, res: Response) => {
    const { outletId, guestId, customerName, customerPhone, deliveryAddress, items } = req.body as any
    if (!outletId || !customerName || !customerPhone || !items?.length) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, customer name, phone, and items are required' } })
    }
    const orderNumber = `ONL-${Date.now().toString(36).toUpperCase()}`
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.unitPrice * item.quantity), 0)
    const order = await prisma.order.create({
      data: { outletId, orderNumber, orderType: OrderType.DELIVERY, guestId, customerName, customerPhone, roomNumber: deliveryAddress, subtotal: subtotal, total: subtotal, balance: subtotal, createdBy: guestId || '' },
    })
    for (const item of items) {
      await prisma.orderItem.create({ data: { orderId: order.id, productId: item.productId, productName: item.productName, productCode: item.productCode, quantity: item.quantity, unitPrice: item.unitPrice, total: item.unitPrice * item.quantity } })
    }
    return res.status(201).json({ success: true, data: order })
  },
}
