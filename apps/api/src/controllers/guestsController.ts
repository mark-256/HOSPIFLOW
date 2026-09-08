import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const guestsController = {
  list: async (req: Request, res: Response) => {
    const { propertyId, search, isVip } = req.query
    const where: any = { deletedAt: null }
    if (propertyId) where.propertyId = String(propertyId)
    if (isVip !== undefined) where.isVip = isVip === 'true'
    if (search) {
      where.OR = [
        { firstName: { contains: String(search), mode: 'insensitive' } },
        { lastName: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search), mode: 'insensitive' } },
      ]
    }
    const guests = await prisma.guest.findMany({ where, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: guests })
  },

  create: async (req: Request, res: Response) => {
    const { propertyId, firstName, lastName, email, phone, nationality, idNumber, idType, dateOfBirth, address, city, country, preferences, notes, isVip } = req.body as any
    if (!propertyId || !firstName || !lastName) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Property, first name, and last name are required' } })
    }
    const guest = await prisma.guest.create({
      data: { propertyId, firstName, lastName, email, phone, nationality, idNumber, idType, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined, address, city, country, preferences, notes, isVip: isVip ?? false },
    })
    return res.status(201).json({ success: true, data: guest })
  },

  get: async (req: Request, res: Response) => {
    const guest = await prisma.guest.findFirst({ where: { id: req.params.id } })
    if (!guest) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } })
    return res.json({ success: true, data: guest })
  },

  update: async (req: Request, res: Response) => {
    const { firstName, lastName, email, phone, nationality, idNumber, idType, dateOfBirth, address, city, country, preferences, notes, isVip, isBlacklisted } = req.body
    const guest = await prisma.guest.update({
      where: { id: req.params.id },
      data: { firstName, lastName, email, phone, nationality, idNumber, idType, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined, address, city, country, preferences, notes, isVip, isBlacklisted },
    })
    return res.json({ success: true, data: guest })
  },
}
