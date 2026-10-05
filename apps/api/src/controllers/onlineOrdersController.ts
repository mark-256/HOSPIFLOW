import { Response } from 'express'
import { PrismaClient, OrderType } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

function toDecimal(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Invalid monetary value')
  }
  return Math.round(num * 100) / 100
}

export const onlineOrdersController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, status } = req.query
    const where: any = { orderType: 'DELIVERY', outlet: { property: { organizationId: req.user!.organizationId } } }
    if (outletId) where.outletId = String(outletId)
    if (status) where.status = String(status)
    const orders = await prisma.order.findMany({ where, include: { items: true, guest: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: orders })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, guestId, customerName, customerPhone, deliveryAddress, items } = req.body as any
    if (!outletId || !customerName || !customerPhone || !items?.length) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet, customer name, phone, and items are required' } })
    }
    const outlet = await prisma.outlet.findFirst({
      where: { id: String(outletId), property: { organizationId: req.user!.organizationId } },
      select: { id: true },
    })
    if (!outlet) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    }
    let validatedGuestId: string | undefined
    if (guestId) {
      const guest = await prisma.guest.findFirst({
        where: { id: String(guestId), property: { organizationId: req.user!.organizationId } },
        select: { id: true },
      })
      if (!guest) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
      }
      validatedGuestId = guest.id
    }
    const orderNumber = `ONL-${Date.now().toString(36).toUpperCase()}`
    let subtotal = 0
    const orderItems: any[] = []
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Each item requires a valid productId and quantity' } })
      }
      const product = await prisma.product.findFirst({
        where: {
          id: String(item.productId),
          menuCategory: { menu: { outletId: outlet.id } },
        },
        include: { menuCategory: { include: { menu: true } } },
      })
      if (!product) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Product ${item.productId} is not available for this outlet` } })
      }
      const unitPrice = toDecimal(product.price)
      const quantity = Math.max(1, Math.floor(Number(item.quantity)))
      const total = Math.round(unitPrice * quantity * 100) / 100
      subtotal = Math.round((subtotal + total) * 100) / 100
      orderItems.push({ productId: product.id, productName: product.name, productCode: product.code, quantity, unitPrice, total })
    }
    const order = await prisma.order.create({
      data: {
        outletId: outlet.id,
        orderNumber,
        orderType: OrderType.DELIVERY,
        guestId: validatedGuestId,
        customerName,
        customerPhone,
        roomNumber: deliveryAddress,
        subtotal,
        total: subtotal,
        balance: subtotal,
        createdById: req.user?.id,
      },
    })
    for (const item of orderItems) {
      await prisma.orderItem.create({ data: { orderId: order.id, ...item } })
    }
    return res.status(201).json({ success: true, data: order })
  },
}
