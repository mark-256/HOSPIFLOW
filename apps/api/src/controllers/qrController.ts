import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const qrController = {
  generate: async (req: Request, res: Response) => {
    const { tableId, outletId, roomNumber, propertyId } = req.body
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS)
    const qrCode = `QR-${Date.now().toString(36).toUpperCase()}`
    const table = await prisma.table.update({ where: { id: tableId }, data: { qrCode: token } })
    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    return res.json({ success: true, data: { token, qrCode, url: `${appUrl}/qr-order?token=${encodeURIComponent(token)}`, expiresAt } })
  },

  lookup: async (req: Request, res: Response) => {
    const { token } = req.params
    const table = await prisma.table.findFirst({
      where: { qrCode: token },
      include: { outlet: { select: { id: true, name: true, propertyId: true } } },
    })
    if (!table) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    }
    return res.json({
      success: true,
      data: {
        tableId: table.id,
        tableName: table.name,
        outletId: table.outletId,
        outletName: table.outlet.name,
        propertyId: table.outlet.propertyId,
      },
    })
  },
  menu: async (req: Request, res: Response) => {
    const { token } = req.params
    const table = await prisma.table.findFirst({ where: { qrCode: token }, select: { outletId: true } })
    if (!table) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    }
    const menus = await prisma.menu.findMany({
      where: { outletId: table.outletId, isActive: true },
      include: {
        categories: {
          where: { isActive: true },
          include: {
            products: {
              where: { isActive: true, isAvailable: true },
              select: { id: true, name: true, code: true, price: true, description: true, image: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, data: menus })
  },
  createOrder: async (req: Request, res: Response) => {
    const { token, items = [] } = req.body
    if (!token || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'QR token and at least one item are required' } })
    }
    const table = await prisma.table.findFirst({ where: { qrCode: token }, include: { outlet: { select: { id: true, propertyId: true, property: { select: { organizationId: true } } } } } })
    if (!table) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    const preparedItems: Array<{ productId: string; productName: string; productCode: string; quantity: number; unitPrice: number; total: number }> = []
    let subtotal = 0
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId }, include: { menuCategory: { include: { menu: true } } } })
      if (!product || product.menuCategory?.menu?.outletId !== table.outletId) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Product ${item.productId} is not available for this table` } })
      }
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)))
      const unitPrice = Math.round(Number(product.price) * 100) / 100
      const total = Math.round(unitPrice * quantity * 100) / 100
      subtotal = Math.round((subtotal + total) * 100) / 100
      preparedItems.push({ productId: product.id, productName: product.name, productCode: product.code, quantity, unitPrice, total })
    }
    const orderNumber = `QR-${Date.now().toString(36).toUpperCase()}`
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({ data: { outletId: table.outletId, tableId: table.id, orderNumber, orderType: 'DINE_IN', customerName: 'QR Guest', subtotal, total: subtotal, balance: subtotal, status: 'OPEN', createdById: null } })
      await tx.orderItem.createMany({ data: preparedItems.map((item) => ({ orderId: created.id, ...item })) })
      return tx.order.update({ where: { id: created.id }, data: { status: 'SENT_TO_KITCHEN', sentToKitchenAt: new Date() } })
    })
    return res.status(201).json({ success: true, data: order })
  },
}
