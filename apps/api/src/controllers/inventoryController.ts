import { Request, Response } from 'express'
import { PrismaClient, StockMovementType } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const inventoryController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { organizationId, category, search, page, limit } = req.query
    const where: any = { organizationId: String(organizationId || req.user!.organizationId) }
    if (category) where.category = String(category)
    if (search) where.name = { contains: String(search), mode: 'insensitive' }
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({ where, orderBy: { name: 'asc' }, skip, take: l }),
      prisma.inventoryItem.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(items, p, l, total))
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { organizationId, name, sku, description, category, unit, unitCost, reorderLevel, minStockLevel, maxStockLevel, expiryTracking } = req.body as any
    const orgId = req.user!.organizationId
    if (!name || !sku || !unit) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name, SKU, and unit are required' } })
    }
    const item = await prisma.inventoryItem.create({ data: { organizationId: orgId, name, sku, description, category, unit, unitCost: parseFloat(unitCost) || 0, reorderLevel: parseFloat(reorderLevel) || 0, minStockLevel: parseFloat(minStockLevel) || 0, maxStockLevel: maxStockLevel ? parseFloat(maxStockLevel) : null, expiryTracking: expiryTracking ?? false } })
    return res.status(201).json({ success: true, data: item })
  },

  movements: async (req: AuthenticatedRequest, res: Response) => {
    const { itemId, page, limit } = req.query
    const where: any = {}
    if (itemId) where.inventoryItemId = String(itemId)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: l }),
      prisma.stockMovement.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(movements, p, l, total))
  },

  createMovement: async (req: AuthenticatedRequest, res: Response) => {
    const { inventoryItemId, type, quantity, unitCost, reference, batchNumber, expiryDate, notes } = req.body
    if (!inventoryItemId || !type || quantity === undefined) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Item, type, and quantity are required' } })
    }
    const movement = await prisma.stockMovement.create({ data: { inventoryItemId, type: type as StockMovementType, quantity: parseFloat(quantity), unitCost: unitCost ? parseFloat(unitCost) : null, reference, batchNumber, expiryDate: expiryDate ? new Date(expiryDate) : undefined, notes, createdBy: req.user?.id } })
    return res.status(201).json({ success: true, data: movement })
  },
}
