import { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * QR tokens are self-describing: "<expiryEpochMs>-<48 hex chars>".
 * The random suffix keeps the token unguessable while the prefix lets the
 * public lookup/order endpoints enforce the advertised expiry without an
 * extra database column. Legacy tokens (plain hex, no prefix) are treated as
 * non-expiring so previously issued table codes keep working.
 */
function createQrToken(): { token: string; expiresAt: Date } {
  const expiresAtMs = Date.now() + TOKEN_EXPIRY_MS
  return {
    token: `${expiresAtMs}-${randomBytes(24).toString('hex')}`,
    expiresAt: new Date(expiresAtMs),
  }
}

function isTokenExpired(token: string): boolean {
  const separatorIndex = token.indexOf('-')
  if (separatorIndex <= 0) return false
  const prefix = token.slice(0, separatorIndex)
  if (!/^\d{10,}$/.test(prefix)) return false
  return Number(prefix) <= Date.now()
}

async function findActiveTableByToken(token: string) {
  if (typeof token !== 'string' || !token || isTokenExpired(token)) return null
  return prisma.table.findFirst({ where: { qrCode: token } })
}

export const qrController = {
  generate: async (req: AuthenticatedRequest, res: Response) => {
    const { tableId } = req.body
    if (!tableId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Table is required' } })
    }
    const table = await prisma.table.findFirst({
      where: { id: String(tableId), outlet: { property: { organizationId: req.user!.organizationId } } },
      select: { id: true },
    })
    if (!table) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table not found' } })
    }
    const { token, expiresAt } = createQrToken()
    const qrCode = `QR-${Date.now().toString(36).toUpperCase()}`
    await prisma.table.update({ where: { id: table.id }, data: { qrCode: token } })
    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    return res.json({ success: true, data: { token, qrCode, url: `${appUrl}/qr-order?token=${encodeURIComponent(token)}`, expiresAt } })
  },

  lookup: async (req: Request, res: Response) => {
    const { token } = req.params
    const table = await findActiveTableByToken(token)
    if (!table) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    }
    const outlet = await prisma.outlet.findFirst({
      where: { id: table.outletId },
      select: { id: true, name: true, propertyId: true },
    })
    if (!outlet) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    }
    return res.json({
      success: true,
      data: {
        tableId: table.id,
        tableName: table.name,
        outletId: table.outletId,
        outletName: outlet.name,
        propertyId: outlet.propertyId,
      },
    })
  },
  menu: async (req: Request, res: Response) => {
    const { token } = req.params
    const table = await findActiveTableByToken(token)
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
    const table = await findActiveTableByToken(token)
    if (!table) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    const preparedItems: Array<{ productId: string; productName: string; productCode: string; quantity: number; unitPrice: number; total: number }> = []
    let subtotal = 0
    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: { id: String(item?.productId), menuCategory: { menu: { outletId: table.outletId } } },
        include: { menuCategory: { include: { menu: true } } },
      })
      if (!product) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Product ${item?.productId} is not available for this table` } })
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
