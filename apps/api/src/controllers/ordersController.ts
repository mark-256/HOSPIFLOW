import { Request, Response } from 'express'
import { PrismaClient, OrderStatus, OrderType, PaymentMethod, PaymentStatus, PaymentProvider } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { BadRequestError } from '../utils/errors'
import {
  MAX_MONEY_10_2,
  assertPaymentMethod,
  assertPaymentProvider,
  parseMonetaryAmount,
  recordOrderCollection,
} from '../services/financialIntegrity'

const prisma = new PrismaClient()

function toDecimal(value: unknown): number {
  // A hostile monetary value is a client error, never an unhandled 500.
  return parseMonetaryAmount(value, { field: 'amount', max: MAX_MONEY_10_2 })
}

/** Order statuses that can no longer collect or release money. */
const NON_COLLECTABLE_ORDER_STATUSES: string[] = [OrderStatus.CANCELLED]

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
    let validatedTableId: string | undefined
    if (tableId) {
      const table = await prisma.table.findFirst({ where: { id: String(tableId), outletId: outlet.id } })
      if (!table) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table not found for this outlet' } })
      validatedTableId = table.id
    }
    let validatedGuestId: string | undefined
    if (guestId) {
      const guest = await prisma.guest.findFirst({ where: { id: String(guestId), property: { organizationId: req.user!.organizationId } } })
      if (!guest) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
      validatedGuestId = guest.id
    }
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
        tableId: validatedTableId,
        orderNumber,
        orderType: orderType as OrderType,
        guestId: validatedGuestId,
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
            const inventoryItem = await prisma.inventoryItem.findFirst({
              where: { id: ingredient.inventoryItemId, organizationId: req.user!.organizationId },
              select: { id: true },
            })
            if (!inventoryItem) continue
            await prisma.stockMovement.create({
              data: {
                inventoryItemId: inventoryItem.id,
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
    const { productId, quantity, notes } = req.body ?? {}
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { outlet: { select: { property: { select: { organizationId: true } } } } } })
    if (!order || order.outlet.property.organizationId !== req.user!.organizationId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })
    if (!productId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Product ID is required' } })
    }
    const parsedQuantity = Number(quantity)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Quantity must be a positive number' } })
    }
    const product = await prisma.product.findFirst({
      where: {
        id: String(productId),
        menuCategory: { menu: { outletId: order.outletId } },
      },
    })
    if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found for this outlet' } })
    // B36 rule, strengthened by B40: the price is the authoritative product price.
    // A client-supplied unitPrice is never allowed to lower it, because a lowered
    // price lowers the order total, the balance and therefore the amount the
    // server will later accept as payment. Discounts are a separate, authorised
    // operation (order discount / discountEngine), not a field on an add-item
    // request.
    const authoritativePrice = Number(product.price)
    const qty = Math.max(1, Math.floor(parsedQuantity))
    const total = Math.round(authoritativePrice * qty * 100) / 100
    // B40 — a hostile quantity that overflows the Decimal(10,2) column must be a
    // 4xx before it reaches Prisma, never an unhandled 500.
    if (total > MAX_MONEY_10_2) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Quantity results in a total that exceeds the maximum supported value' } })
    }
    const item = await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, productName: product.name, productCode: product.code, quantity: qty, unitPrice: authoritativePrice, total, notes } })
    await prisma.order.update({ where: { id: order.id }, data: { subtotal: { increment: total }, total: { increment: total }, balance: { increment: total } } })
    return res.status(201).json({ success: true, data: item })
  },

  pay: async (req: AuthenticatedRequest, res: Response) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
    const { paymentMethod, amount, reference, provider } = req.body ?? {}
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { outlet: { select: { property: { select: { organizationId: true } } } } } })
    if (!order || order.outlet.property.organizationId !== req.user!.organizationId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } })

    // Enum and amount validation happen before any write so an invalid value is a
    // 4xx client error rather than a database exception.
    const validatedMethod = assertPaymentMethod(paymentMethod) as PaymentMethod
    const validatedProvider = provider === undefined || provider === null ? undefined : (assertPaymentProvider(provider) as PaymentProvider)
    const amountNum = toDecimal(amount)

    if (idempotencyKey) {
      const existing = await prisma.orderPayment.findFirst({ where: { orderId: order.id, reference: idempotencyKey } })
      if (existing) {
        // Reusing one key for a materially different request must not silently
        // replay the first charge.
        if (Math.round(Number(existing.amount) * 100) !== Math.round(amountNum * 100)) {
          throw new BadRequestError('Idempotency-Key has already been used for a different amount')
        }
        if (existing.paymentMethod !== validatedMethod) {
          throw new BadRequestError('Idempotency-Key has already been used for a different payment method')
        }
        return res.status(200).json({ success: true, data: existing, meta: { deduplicated: true } })
      }
    }

    // A cancelled order cannot collect money.
    if (NON_COLLECTABLE_ORDER_STATUSES.includes(String(order.status))) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Cannot collect payment on a ${order.status} order` } })
    }

    const balance = Math.round(Number(order.balance) * 100) / 100
    if (amountNum > balance) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Amount exceeds balance' } })
    }

    // The payment row and the order ledger must move together, and the ledger
    // update is guarded by the authoritative remaining balance so concurrent
    // requests can never both collect the same money.
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.orderPayment.create({
        data: {
          orderId: order.id,
          paymentMethod: validatedMethod,
          amount: amountNum,
          reference: reference || idempotencyKey || undefined,
          provider: validatedProvider,
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(),
        },
      })

      const applied = await recordOrderCollection(tx as unknown as PrismaClient, order.id, amountNum)
      if (!applied) {
        throw new BadRequestError('Amount exceeds balance')
      }

      return created
    })

    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'PAYMENT',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          method: validatedMethod,
          provider: validatedProvider ?? null,
          amount: amountNum.toFixed(2),
          orderId: order.id,
        },
      },
    })
    return res.status(201).json({ success: true, data: payment })
  },
}
