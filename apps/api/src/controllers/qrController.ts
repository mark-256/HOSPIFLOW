import { Request, Response } from 'express'
import { nanoid } from 'nanoid'
import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

export const qrController = {
  generate: async (req: Request, res: Response) => {
    const { tableId, outletId, roomNumber, propertyId } = req.body
    const token = nanoid(32)
    const qrCode = `QR-${Date.now().toString(36).toUpperCase()}`
    const table = await prisma.table.update({ where: { id: tableId }, data: { qrCode: token } })
    return res.json({ success: true, data: { token, qrCode, url: `${process.env.APP_URL || 'http://localhost:3000'}/order/${token}` } })
  },

  lookup: async (req: Request, res: Response) => {
    const { token } = req.params
    const table = await prisma.table.findFirst({ where: { qrCode: token }, include: { outlet: true } })
    if (!table) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invalid QR code' } })
    return res.json({ success: true, data: { tableId: table.id, tableName: table.name, outletId: table.outletId, outletName: table.outlet.name } })
  },
}
