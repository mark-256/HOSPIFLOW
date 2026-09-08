import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const productsController = {
  list: async (req: Request, res: Response) => {
    const { categoryId } = req.query
    const where = categoryId ? { menuCategoryId: String(categoryId) } : {}
    const products = await prisma.product.findMany({ where, include: { variants: true, modifiers: true } })
    return res.json({ success: true, data: products })
  },

  create: async (req: Request, res: Response) => {
    const { menuCategoryId, name, code, description, price, cost, station, tags } = req.body
    if (!menuCategoryId || !name || !code) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category, name, and code are required' } })
    }
    const product = await prisma.product.create({ data: { menuCategoryId, name, code, description, price: parseFloat(price), cost: cost ? parseFloat(cost) : null, station, tags: tags ?? [] } })
    return res.status(201).json({ success: true, data: product })
  },
}
