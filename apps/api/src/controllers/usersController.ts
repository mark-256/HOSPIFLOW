import { PrismaClient } from '@hospiflow/database'
import bcrypt from 'bcrypt'
import { AuthenticatedRequest } from '../middleware/auth'
import { Request, Response } from 'express'

const prisma = new PrismaClient()

function sanitize(user: any) {
  const { passwordHash: _, ...safeUser } = user
  return safeUser
}

export const usersController = {
  getUsers: async (req: AuthenticatedRequest, res: Response) => {
    const { roleId, search } = req.query
    const where: any = { organizationId: req.user!.organizationId, deletedAt: null }
    if (roleId) where.roleId = String(roleId)
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { firstName: { contains: String(search), mode: 'insensitive' } },
        { lastName: { contains: String(search), mode: 'insensitive' } },
      ]
    }
    const users = await prisma.user.findMany({ where, include: { role: true }, orderBy: { createdAt: 'desc' } })
    return res.json({ success: true, data: users.map(sanitize) })
  },

  createUser: async (req: Request, res: Response) => {
    const authenticated = req as AuthenticatedRequest
    const { roleId, email, password, firstName, lastName, phone } = req.body
    if (!roleId || !email || !password || !firstName || !lastName) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } })
    const existingUser = await prisma.user.findFirst({ where: { organizationId: authenticated.user!.organizationId, email, deletedAt: null } })
    if (existingUser) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'User with this email already exists' } })
    const role = await prisma.appRole.findFirst({ where: { id: roleId, organizationId: authenticated.user!.organizationId } })
    if (!role) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Role not found in this organization' } })
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { organizationId: authenticated.user!.organizationId, roleId, email, passwordHash, firstName, lastName, phone }, include: { role: true } })
    return res.status(201).json({ success: true, data: sanitize(user) })
  },

  getUser: async (req: AuthenticatedRequest, res: Response) => {
    const user = await prisma.user.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId, deletedAt: null }, include: { role: true } })
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    return res.json({ success: true, data: sanitize(user) })
  },

  updateUser: async (req: AuthenticatedRequest, res: Response) => {
    const { firstName, lastName, email, phone, roleId, isActive, preferences } = req.body
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId, deletedAt: null } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    if (roleId) {
      const role = await prisma.appRole.findFirst({ where: { id: roleId, organizationId: req.user!.organizationId } })
      if (!role) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Role not found in this organization' } })
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(firstName && { firstName }), ...(lastName && { lastName }), ...(email && { email }), ...(phone !== undefined && { phone }),
        ...(roleId && { roleId }), ...(isActive !== undefined && { isActive }), ...(preferences && { preferences }),
      },
      include: { role: true },
    })
    return res.json({ success: true, data: sanitize(user) })
  },

  deleteUser: async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, organizationId: req.user!.organizationId, deletedAt: null } })
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } })
    await prisma.user.update({ where: { id: existing.id }, data: { deletedAt: new Date() } })
    return res.json({ success: true, data: { message: 'User deleted successfully' } })
  },
}
