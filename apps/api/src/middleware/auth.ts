import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@hospiflow/database'
import { config } from '../config'

const prisma = new PrismaClient()

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    organizationId: string
    roleId: string
    email: string
    firstName: string
    lastName: string
    permissions: string[]
  }
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No token provided' },
      })
    }

    const token = authHeader.substring(7)

    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: string
      organizationId: string
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true },
    })

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' },
      })
    }

    req.user = {
      id: user.id,
      organizationId: user.organizationId,
      roleId: user.roleId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      permissions: user.role.permissions,
    }

    next()
    } catch {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      })
    }
}

export function requirePermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      })
    }

    const hasPermission = permissions.some((p: string) => req.user!.permissions.includes(p))

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      })
    }

    next()
  }
}
