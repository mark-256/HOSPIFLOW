import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { Response } from 'express'

const prisma = new PrismaClient()

export const suppliersController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { search, isActive } = req.query
    const where: any = { organizationId: req.user!.organizationId }
    if (search) where.name = { contains: String(search), mode: 'insensitive' }
    if (isActive !== undefined) where.isActive = isActive === 'true'
    const suppliers = await prisma.supplier.findMany({ where, include: { _count: { select: { purchaseOrders: true } } }, orderBy: { name: 'asc' } })
    return res.json({ success: true, data: suppliers })
  },

  create: async (req: AuthenticatedRequest, res: Response) => {
    const { name, code, contactPerson, email, phone, address, city, country, taxNumber, paymentTerms, rating, notes, isActive = true } = req.body
    if (!name || !code) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name and code are required' } })
    try {
      const supplier = await prisma.supplier.create({ data: { organizationId: req.user!.organizationId, name, code, contactPerson, email, phone, address, city, country, taxNumber, paymentTerms, rating: rating === undefined ? null : Number(rating), notes, isActive } })
      return res.status(201).json({ success: true, data: supplier })
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A supplier with this code already exists' } })
      throw error
    }
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId }, include: { purchaseOrders: { orderBy: { orderDate: 'desc' } } } })
    if (!supplier) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } })
    return res.json({ success: true, data: supplier })
  },

  update: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } })
    const { name, code, contactPerson, email, phone, address, city, country, taxNumber, paymentTerms, rating, notes, isActive } = req.body
    try {
      const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: { ...(name && { name }), ...(code && { code }), ...(contactPerson !== undefined && { contactPerson }), ...(email !== undefined && { email }), ...(phone !== undefined && { phone }), ...(address !== undefined && { address }), ...(city !== undefined && { city }), ...(country !== undefined && { country }), ...(taxNumber !== undefined && { taxNumber }), ...(paymentTerms !== undefined && { paymentTerms }), ...(rating !== undefined && { rating: Number(rating) }), ...(notes !== undefined && { notes }), ...(isActive !== undefined && { isActive }) } })
      return res.json({ success: true, data: supplier })
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A supplier with this code already exists' } })
      throw error
    }
  },

  remove: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } })
    await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: false } })
    return res.json({ success: true, data: { message: 'Supplier deactivated' } })
  },
}
