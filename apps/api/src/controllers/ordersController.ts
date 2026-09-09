import { Request, Response } from 'express'
import { PrismaClient, OrderStatus, OrderType, PaymentMethod, PaymentStatus, PaymentProvider } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

function toDecimal(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Invalid monetary value')
  }
  return Math.round(num * 100) / 100
}

export const ordersController = {
   list: async (req: AuthenticatedRequest, res: Response) => {
    const { outletId, status, tableId, from, to, page, limit } = req.query
    const where: any = { outlet: { property: { organizationId: req.user!.organizationId } } }
    if (outletId) where.outletId = String(outletId)
    if (status) where.status = String(status)
    if (tableId) where.tableId = String(tableId)
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(String(from)) }
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(String(to)) }
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, include: { items: { include: { modifiers: true } }, payments: true, table: true, guest: true }, orderBy: { createdAt: 'desc' }, skip, take: l }),
      prisma.order.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(orders, p, l, total))
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
    const { outletId, tableId, orderType, guestId, customerName, customerPhone, roomNumber, covers, notes } = req.body as any
    if (!outletId || !orderType) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Outlet and order type are required' } })
    }
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId, property: { organizationId: req.user!.organizationId } } })
    if (!outlet) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Outlet not found' } })
    if (idempotencyKey) {
      const existing = await prisma.order.findFirst({
        where: {
          outletId,
          notes: { contains: `idem:${idempotencyKey}` },
        },
      })
      if (existing) {
        return res.status(200).json({ success: true, data: existing, meta: { deduplicated: true } })
      }
    }
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    const order = await prisma.order.create({
      data: {
        outletId,
        tableId,
        orderNumber,
        orderType: orderType as OrderType,
        guestId,
        customerName,
        customerPhone,
        roomNumber,
        covers: covers ? parseInt(covers) : null,
        notes: notes ? `${notes} | idem:${idempotencyKey}` : (idempotencyKey ? `idem:${idempotencyKey}` : null),
        createdById: req.user?.id,
      },
    })
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: order.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
      },
    })
    return res.status(201).json({ success: true, data: order })
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, outlet: { property: { organizationId: req.user!.organizationId } } }, include: { items: { include: { modifiers: true } }, payments: true, table: true, guest: true } })
    if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    return res.json({ success: true, data: order })
  },

  updateStatus: async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.body
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.DRAFT]: [OrderStatus.OPEN, OrderStatus.CANCELLED],
      [OrderStatus.OPEN]: [OrderStatus.SENT_TO_KITCHEN, OrderStatus.CANCELLED],
      [OrderStatus.SENT_TO_KITCHEN]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
      [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
      [OrderStatus.SERVED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: [],
    }
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { outlet: { select: { property: { select: { organizationId: true } } } } } })
    if (!order || order.outlet.property.organizationId !== req.user!.organizationId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    const currentStatus = order.status as OrderStatus
    const nextStatus = status as OrderStatus
    if (!Object.values(OrderStatus).includes(nextStatus)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid status value' } })
    }
    const allowed = allowedTransitions[currentStatus] || []
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Cannot transition from ${currentStatus} to ${nextStatus}` } })
    }
    const data: any = { status: nextStatus }
    if (nextStatus === OrderStatus.SENT_TO_KITCHEN) data.sentToKitchenAt = new Date()
    if (nextStatus === OrderStatus.COMPLETED) {
      data.completedAt = new Date()
      const orderWithItems = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } })
      if (!orderWithItems) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
      }
      const completed = await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.COMPLETED, completedAt: new Date() } })
      for (const item of orderWithItems.items) {
        const recipe = await prisma.recipe.findUnique({ where: { productId: item.productId }, include: { ingredients: true } })
        if (recipe && recipe.ingredients.length > 0) {
          for (const ingredient of recipe.ingredients) {
            await prisma.stockMovement.create({
              data: {
                inventoryItemId: ingredient.inventoryItemId,
                productId: item.productId,
                orderId: order.id,
                type: 'SALE',
                quantity: Number(ingredient.quantity) * item.quantity,
                unitCost: null,
                reference: order.orderNumber,
                notes: `Auto-deducted for order ${order.orderNumber}`,
              },
            })
          }
        }
      }
      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          action: 'ORDER_COMPLETED',
          entity: 'Order',
          entityId: order.id,
          ip: req.ip || undefined,
          userAgent: req.headers['user-agent'] || undefined,
        },
      })
      return res.json({ success: true, data: completed })
    }
    if (nextStatus === OrderStatus.CANCELLED) {
      data.cancelledAt = new Date()
      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          action: 'ORDER_CANCELLED',
          entity: 'Order',
          entityId: order.id,
          ip: req.ip || undefined,
          userAgent: req.headers['user-agent'] || undefined,
        },
      })
    } else {
      await prisma.auditLog.create({
        data: {
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          action: 'ORDER_MODIFIED',
          entity: 'Order',
          entityId: order.id,
          ip: req.ip || undefined,
          userAgent: req.headers['user-agent'] || undefined,
        },
      })
    }
    const updated = await prisma.order.update({ where: { id: order.id }, data })
    return res.json({ success: true, data: updated })
  },

  addItem: async (req: AuthenticatedRequest, res: Response) => {
    const { productId, productName, productCode, quantity, unitPrice, notes } = req.body
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { outlet: { select: { property: { select: { organizationId: true } } } } } })
    if (!order || order.outlet.property.organizationId !== req.user!.organizationId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    if (!productId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Product ID is required' } })
    }
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } })
    const authoritativePrice = toDecimal(product.price)
    const clientPrice = unitPrice !== undefined ? toDecimal(unitPrice) : null
    const finalUnitPrice = clientPrice !== null ? Math.min(clientPrice, authoritativePrice) : authoritativePrice
    const qty = Math.max(1, Math.floor(Number(quantity)))
    const total = Math.round(finalUnitPrice * qty * 100) / 100
    const item = await prisma.orderItem.create({ data: { orderId: order.id, productId, productName: product.name, productCode: product.code, quantity: qty, unitPrice: finalUnitPrice, total, notes } })
    await prisma.order.update({ where: { id: order.id }, data: { subtotal: { increment: total }, total: { increment: total }, balance: { increment: total } } })
    return res.status(201).json({ success: true, data: item })
  },

  pay: async (req: AuthenticatedRequest, res: Response) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
    const { paymentMethod, amount, reference, provider } = req.body
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { outlet: { select: { property: { select: { organizationId: true } } } } } })
    if (!order || order.outlet.property.organizationId !== req.user!.organizationId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    const amountNum = toDecimal(amount)
    if (idempotencyKey) {
      const existing = await prisma.orderPayment.findFirst({ where: { orderId: order.id, reference: idempotencyKey } })
      if (existing) {
        return res.status(200).json({ success: true, data: existing, meta: { deduplicated: true } })
      }
    }
    const balance = Math.round(Number(order.balance) * 100) / 100
    if (amountNum > balance) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Amount exceeds balance' } })
    }
    const payment = await prisma.orderPayment.create({
      data: {
        orderId: order.id,
        paymentMethod: paymentMethod as PaymentMethod,
        amount: amountNum,
        reference: reference || idempotencyKey || undefined,
        provider: provider as PaymentProvider | undefined,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
      },
    })
    const newPaidAmount = Math.round((Number(order.paidAmount) + amountNum) * 100) / 100
    const newBalance = Math.round((Number(order.total) - newPaidAmount) * 100) / 100
    await prisma.order.update({ where: { id: order.id }, data: { paidAmount: newPaidAmount, balance: newBalance } })
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'PAYMENT',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
      },
    })
    return res.status(201).json({ success: true, data: payment })
  },
}
