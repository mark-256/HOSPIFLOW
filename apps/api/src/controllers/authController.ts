import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { PrismaClient } from '@hospiflow/database'
import { config } from '../config'
import { AuthenticatedRequest } from '../middleware/auth'

const prisma = new PrismaClient()

export const authController = {
  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
      })
    }

    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { role: true, organization: true },
    })

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      })
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      })
    }

    const token = jwt.sign(
      { userId: user.id, organizationId: user.organizationId },
      config.jwtSecret as jwt.Secret,
      { expiresIn: config.jwtExpiry as any }
    )

    const refreshToken = jwt.sign(
      { userId: user.id, organizationId: user.organizationId, jti: randomUUID() },
      config.jwtRefreshSecret as jwt.Secret,
      { expiresIn: config.jwtRefreshExpiry as any }
    )

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent: req.headers['user-agent'] || undefined,
        ip: req.ip || undefined,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
      },
    })

    return res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role.name,
          permissions: user.role.permissions.map((p: any) => p.name),
          organization: {
            id: user.organization.id,
            name: user.organization.name,
          },
        },
      },
      })
    } catch (error) {
      next(error)
    }
  },

  me: async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { role: true, organization: true },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      })
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        permissions: user.role.permissions.map((p: any) => p.name),
        organization: {
          id: user.organization.id,
          name: user.organization.name,
        },
      },
    })
  },

  logout: async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      })
    }

    await prisma.session.deleteMany({
      where: { userId: req.user.id },
    })

    return res.json({
      success: true,
      data: { message: 'Logged out successfully' },
    })
  }
}


