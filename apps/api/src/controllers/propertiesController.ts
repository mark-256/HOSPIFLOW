import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const propertiesController = {
  getProperties: async (req: AuthenticatedRequest, res: Response) => {
    const properties = await prisma.property.findMany({
      where: { organizationId: req.user!.organizationId, deletedAt: null },
      include: {
        organization: true,
        _count: { select: { outlets: true, rooms: true, guests: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, data: properties })
  },

  createProperty: async (req: AuthenticatedRequest, res: Response) => {
    const { name, code, address, city, country, phone, email, timezone, currency } = req.body
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and code are required' },
      })
    }
    const property = await prisma.property.create({
      data: {
        organizationId: req.user!.organizationId,
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

  getProperty: async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params
    const property = await prisma.property.findFirst({
      where: { id, organizationId: req.user!.organizationId, deletedAt: null },
      include: { organization: true, outlets: true, rooms: true },
    })
    if (!property) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Property not found' } })
    }
    return res.json({ success: true, data: property })
  },

  updateProperty: async (req: AuthenticatedRequest, res: Response) => {
    const { name, status, address, city, country, phone, email, timezone, currency, settings } = req.body
    const property = await prisma.property.update({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
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
