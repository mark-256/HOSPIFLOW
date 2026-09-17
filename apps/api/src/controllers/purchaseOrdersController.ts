import { PrismaClient, PurchaseOrderStatus, StockMovementType } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { Response } from 'express'

const prisma = new PrismaClient()

const allowedTransitions: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ORDERED', 'SUBMITTED', 'CANCELLED'],
  ORDERED: ['RECEIVED', 'PARTIALLY_RECEIVED', 'APPROVED', 'CANCELLED'],
  RECEIVED: ['CLOSED', 'ORDERED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'ORDERED', 'CANCELLED'],
  CANCELLED: [],
  CLOSED: [],
}

export const purchaseOrdersController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { supplierId, status, search } = req.query
    const where: any = { organizationId: req.user!.organizationId }
    if (supplierId) where.supplierId = String(supplierId)
    if (status) where.status = String(status)
    if (search) where.orderNumber = { contains: String(search), mode: 'insensitive' }
    const orders = await prisma.purchaseOrder.findMany({ where, include: { supplier: true, items: { include: { inventoryItem: true } }, receipts: true }, orderBy: { orderDate: 'desc' } })
    return res.json({ success: true, data: orders })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { supplierId, expectedDate, notes, items = [] } = req.body
    if (!supplierId || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Supplier and at least one item are required' } })
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: req.user!.organizationId } })
    if (!supplier) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } })

    const preparedItems: Array<{ inventoryItemId: string; quantity: number; unitCost: number }> = []
    let subtotal = 0
    for (const item of items) {
      const inventoryItem = await prisma.inventoryItem.findFirst({ where: { id: item.inventoryItemId, organizationId: req.user!.organizationId } })
      if (!inventoryItem) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Inventory item ${item.inventoryItemId} was not found` } })
      const quantity = Number(item.quantity)
      const unitCost = Number(item.unitCost ?? inventoryItem.unitCost)
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Item quantity and cost must be valid' } })
      preparedItems.push({ inventoryItemId: inventoryItem.id, quantity, unitCost })
      subtotal += quantity * unitCost
    }

    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`
    const roundedSubtotal = Math.round(subtotal * 100) / 100
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({ data: { organizationId: req.user!.organizationId, supplierId, orderNumber, status: PurchaseOrderStatus.DRAFT, expectedDate: expectedDate ? new Date(expectedDate) : null, subtotal: roundedSubtotal, tax: 0, total: roundedSubtotal, notes, createdBy: req.user!.id } })
      await tx.purchaseOrderItem.createMany({ data: preparedItems.map((item) => ({ purchaseOrderId: created.id, ...item })) })
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: { supplier: true, items: { include: { inventoryItem: true } } } })
    })
    return res.status(201).json({ success: true, data: order })
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const order = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, include: { supplier: true, items: { include: { inventoryItem: true } }, receipts: { include: { items: { include: { inventoryItem: true } } } } } })
    if (!order) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } })
    return res.json({ success: true, data: order })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, include: { items: true } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } })
    const { status, expectedDate, notes } = req.body
    const nextStatus = status as PurchaseOrderStatus | undefined
    if (nextStatus && !allowedTransitions[existing.status].includes(nextStatus)) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Cannot transition from ${existing.status} to ${nextStatus}` } })

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          ...(nextStatus && { status: nextStatus }),
          ...(expectedDate !== undefined && { expectedDate: expectedDate ? new Date(expectedDate) : null }),
          ...(notes !== undefined && { notes }),
          ...(nextStatus === PurchaseOrderStatus.RECEIVED && { receivedDate: new Date() }),
          ...(nextStatus === PurchaseOrderStatus.CLOSED && { receivedDate: existing.receivedDate || new Date() }),
        },
      })
      if (nextStatus === PurchaseOrderStatus.RECEIVED) {
        const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: existing.id } })
        for (const item of items) {
          await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: item.quantity } })
          await tx.stockMovement.create({ data: { inventoryItemId: item.inventoryItemId, type: StockMovementType.PURCHASE, quantity: item.quantity, unitCost: item.unitCost, reference: result.orderNumber, notes: `Received from purchase order ${result.orderNumber}`, createdBy: req.user!.id, purchaseOrderItemId: item.id } })
        }
      }
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id: existing.id }, include: { supplier: true, items: { include: { inventoryItem: true } } } })
    })
    return res.json({ success: true, data: updated })
  },

  remove: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Purchase order not found' } })
    if (!['DRAFT', 'SUBMITTED'].includes(existing.status)) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Only draft purchase orders can be cancelled' } })
    const order = await prisma.purchaseOrder.update({ where: { id: existing.id }, data: { status: PurchaseOrderStatus.CANCELLED } })
    return res.json({ success: true, data: order })
  },
}
