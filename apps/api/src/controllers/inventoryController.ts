import { Request, Response } from 'express'
import { PrismaClient, StockMovementType } from '@hospiflow/database'

const prisma = new PrismaClient()

export const inventoryController = {
  list: async (req: Request, res: Response) => {
    const { organizationId, category, search } = req.query
    const where: any = {}
    if (organizationId) where.organizationId = String(organizationId)
    if (category) where.category = String(category)
    if (search) where.name = { contains: String(search), mode: 'insensitive' }
    const items = await prisma.inventoryItem.findMany({ where, orderBy: { name: 'asc' } })
    return res.json({ success: true, data: items })
  },

  create: async (req: Request, res: Response) => {
    const { organizationId, name, sku, description, category, unit, unitCost, reorderLevel, minStockLevel, maxStockLevel, expiryTracking } = req.body as any
    if (!organizationId || !name || !sku || !unit) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Organization, name, SKU, and unit are required' } })
    }
    const item = await prisma.inventoryItem.create({ data: { organizationId, name, sku, description, category, unit, unitCost: parseFloat(unitCost), reorderLevel: parseFloat(reorderLevel) || 0, minStockLevel: parseFloat(minStockLevel) || 0, maxStockLevel: maxStockLevel ? parseFloat(maxStockLevel) : null, expiryTracking: expiryTracking ?? false } })
    return res.status(201).json({ success: true, data: item })
  },

  movements: async (req: Request, res: Response) => {
    const { itemId } = req.query
    const where = itemId ? { inventoryItemId: String(itemId) } : {}
    const movements = await prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: movements })
  },

  createMovement: async (req: Request, res: Response) => {
    const { inventoryItemId, type, quantity, unitCost, reference, batchNumber, expiryDate, notes } = req.body
    if (!inventoryItemId || !type || quantity === undefined) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Item, type, and quantity are required' } })
    }
    const movement = await prisma.stockMovement.create({ data: { inventoryItemId, type: type as StockMovementType, quantity: parseFloat(quantity), unitCost: unitCost ? parseFloat(unitCost) : null, reference, batchNumber, expiryDate: expiryDate ? new Date(expiryDate) : undefined, notes, createdBy: (req as any).user?.id } })
    return res.status(201).json({ success: true, data: movement })
  },
}
