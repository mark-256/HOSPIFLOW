import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const organizationsController = {
  getOrganizations: async (req: Request, res: Response) => {
    const organizations = await prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, data: organizations })
  },

  createOrganization: async (req: Request, res: Response) => {
    const { name, slug } = req.body
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and slug are required' },
      })
    }
    const organization = await prisma.organization.create({
      data: { name, slug, status: 'ACTIVE' },
    })
    return res.status(201).json({ success: true, data: organization })
  },

  getOrganization: async (req: Request, res: Response) => {
    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, deletedAt: null },
    })
    if (!organization) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } })
    }
    return res.json({ success: true, data: organization })
  },

  updateOrganization: async (req: Request, res: Response) => {
    const { name, status, settings } = req.body
    const organization = await prisma.organization.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(status && { status }), ...(settings && { settings }) },
    })
    return res.json({ success: true, data: organization })
  }
}


