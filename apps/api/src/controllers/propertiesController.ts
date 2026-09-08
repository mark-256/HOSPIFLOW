import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const propertiesController = {
  getProperties: async (req: Request, res: Response) => {
    const { organizationId } = req.query
    const where = organizationId ? { organizationId: String(organizationId) } : {}
    const properties = await prisma.property.findMany({
      where: { ...where, deletedAt: null },
      include: {
        organization: true,
        _count: { select: { outlets: true, rooms: true, guests: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, data: properties })
  },

  createProperty: async (req: Request, res: Response) => {
    const { organizationId, name, code, address, city, country, phone, email, timezone, currency } = req.body
    if (!organizationId || !name || !code) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Organization ID, name, and code are required' },
      })
    }
    const property = await prisma.property.create({
      data: {
        organizationId,
        name,
        code,
        address,
        city,
        country,
        phone,
        email,
        timezone: timezone || 'Africa/Nairobi',
        currency: currency || 'KES',
        status: 'ACTIVE',
      },
      include: { organization: true },
    })
    return res.status(201).json({ success: true, data: property })
  },

  getProperty: async (req: Request, res: Response) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { organization: true, outlets: true, rooms: true },
    })
    if (!property) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    }
    return res.json({ success: true, data: property })
  },

  updateProperty: async (req: Request, res: Response) => {
    const { name, status, address, city, country, phone, email, timezone, currency, settings } = req.body
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(country !== undefined && { country }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(timezone && { timezone }),
        ...(currency && { currency }),
        ...(settings && { settings }),
      },
      include: { organization: true },
    })
    return res.json({ success: true, data: property })
  }
}


