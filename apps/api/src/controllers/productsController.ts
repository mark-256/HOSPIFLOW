import { Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const productsController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { categoryId } = req.query
    const where: any = { menuCategory: { menu: { outlet: { property: { organizationId: req.user!.organizationId } } } } }
    if (categoryId) where.menuCategoryId = String(categoryId)
    const products = await prisma.product.findMany({ where, include: { variants: true, modifiers: true } })
    return res.json({ success: true, data: products })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { menuCategoryId, name, code, description, price, cost, station, tags } = req.body
    if (!menuCategoryId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category, name, and code are required' } })
    }
    const category = await prisma.menuCategory.findFirst({
      where: {
        id: String(menuCategoryId),
        menu: { outlet: { property: { organizationId: req.user!.organizationId } } },
      },
      select: { id: true },
    })
    if (!category) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Menu category not found' } })
    const parsedPrice = parseFloat(price)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Price must be a non-negative number' } })
    }
    const product = await prisma.product.create({ data: { menuCategoryId: category.id, name, code, description, price: parsedPrice, cost: cost ? parseFloat(cost) : null, station, tags: Array.isArray(tags) ? tags : [] } })
    return res.status(201).json({ success: true, data: product })
  },
}
