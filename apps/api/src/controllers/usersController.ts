import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

export const usersController = {
  getUsers: async (req: Request, res: Response) => {
    const { organizationId, roleId, search } = req.query
    const where: any = {}
    if (organizationId) where.organizationId = String(organizationId)
    if (roleId) where.roleId = String(roleId)
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { firstName: { contains: String(search), mode: 'insensitive' } },
        { lastName: { contains: String(search), mode: 'insensitive' } },
      ]
    }
    const users = await prisma.user.findMany({
      where: { ...where, deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    })
    const sanitized = users.map((user: any) => { const { passwordHash: _, ...u } = user; return u })
    return res.json({ success: true, data: sanitized })
  },

  createUser: async (req: Request, res: Response) => {
    const { organizationId, roleId, email, password, firstName, lastName, phone } = req.body
    if (!organizationId || !roleId || !email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' },
      })
    }
    const existingUser = await prisma.user.findFirst({
      where: { organizationId, email, deletedAt: null },
    })
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'User with this email already exists' },
      })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { organizationId, roleId, email, passwordHash, firstName, lastName, phone },
      include: { role: true },
    })
    const { passwordHash: _ph, ...sanitized } = user as any
    return res.status(201).json({ success: true, data: sanitized })
  },

  getUser: async (req: Request, res: Response) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { role: true },
    })
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    const { passwordHash: _ph, ...sanitized } = user as any
    return res.json({ success: true, data: sanitized })
  },

  updateUser: async (req: Request, res: Response) => {
    const { firstName, lastName, email, phone, roleId, isActive, preferences } = req.body
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(email && { email }),
        ...(phone !== undefined && { phone }),
        ...(roleId && { roleId }),
        ...(isActive !== undefined && { isActive }),
        ...(preferences && { preferences }),
      },
      include: { role: true },
    })
    const { passwordHash: _ph, ...sanitized } = user as any
    return res.json({ success: true, data: sanitized })
  },

  deleteUser: async (req: Request, res: Response) => {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    })
    return res.json({ success: true, data: { message: 'User deleted successfully' } })
  }
}


