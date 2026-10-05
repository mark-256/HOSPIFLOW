import { Request, Response } from 'express'
import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { BadRequestError } from '../utils/errors'
import { MAX_MONEY_12_2, parseSignedMonetaryAmount } from '../services/financialIntegrity'

const prisma = new PrismaClient()

/**
 * A monetary amount coming from the client is a client error when it is not a
 * finite, non-negative number. Raising BadRequestError (rather than a plain
 * Error) keeps a hostile value out of the generic 500 handler, which is what
 * turns bad input into a server error. The value must also fit the folio's
 * `Decimal(12,2)` columns.
 */
function toDecimal(value: unknown): number {
  return parseSignedMonetaryAmount(value, { field: 'amount', max: MAX_MONEY_12_2 })
}

const DEBIT_TYPES = ['CHARGE', 'TAX', 'SERVICE_CHARGE']
const CREDIT_TYPES = ['PAYMENT', 'REFUND', 'DISCOUNT']

export const foliosController = {
  list: async (req: AuthenticatedRequest, res: Response) => {
    const { propertyId, guestId, status, page, limit } = req.query
    const where: any = { property: { organizationId: req.user!.organizationId } }
    if (propertyId) where.propertyId = String(propertyId)
    if (guestId) where.guestId = String(guestId)
    if (status) where.status = String(status)
    const { page: p, limit: l, skip } = (await import('../utils/pagination.js')).parsePagination(req.query as Record<string, unknown>)
    const [folios, total] = await Promise.all([
      prisma.folio.findMany({ where, include: { guest: true, reservation: true, transactions: { orderBy: { createdAt: 'desc' } } }, orderBy: { openedAt: 'desc' }, skip, take: l }),
      prisma.folio.count({ where }),
    ])
    const { paginatedResponse } = await import('../utils/pagination.js')
    return res.json(paginatedResponse(folios, p, l, total))
  },

  get: async (req: AuthenticatedRequest, res: Response) => {
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } }, include: { guest: true, reservation: true, transactions: { orderBy: { createdAt: 'desc' } } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    return res.json({ success: true, data: folio })
  },

  createTransaction: async (req: AuthenticatedRequest, res: Response) => {
    const { type, category, description, amount, reference, sourceId, sourceType } = req.body ?? {}
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    if (folio.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Cannot add transactions to a closed folio' } })
    }
    const isDebit = DEBIT_TYPES.includes(type as string)
    const isCredit = CREDIT_TYPES.includes(type as string)
    if (!isDebit && !isCredit) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid transaction type' } })
    }
    const amountNum = toDecimal(amount)

    // The balance is recomputed and written in one guarded SQL statement, so a
    // concurrent posting cannot lose an update and cannot drive the balance
    // negative: PostgreSQL serialises competing updates on the folio row and the
    // guard is evaluated against the locked row.
    const rows = await prisma.$queryRaw<Array<{ balance: string }>>`
      UPDATE "Folio" f
         SET "balance" = CASE WHEN ${isDebit}
                THEN f."balance" + CAST(${amountNum.toFixed(2)} AS numeric)
                ELSE f."balance" - CAST(${amountNum.toFixed(2)} AS numeric) END,
             "totalCharges"  = f."totalCharges"  + CASE WHEN ${isDebit}  THEN CAST(${amountNum.toFixed(2)} AS numeric) ELSE 0 END,
             "totalPayments" = f."totalPayments" + CASE WHEN ${type} = 'PAYMENT'  THEN CAST(${amountNum.toFixed(2)} AS numeric) ELSE 0 END,
             "totalRefunds"  = f."totalRefunds"  + CASE WHEN ${type} = 'REFUND'   THEN CAST(${amountNum.toFixed(2)} AS numeric) ELSE 0 END,
             "totalDiscount" = f."totalDiscount" + CASE WHEN ${type} = 'DISCOUNT' THEN CAST(${amountNum.toFixed(2)} AS numeric) ELSE 0 END,
             "updatedAt" = NOW()
       WHERE f."id" = ${folio.id}
         AND f."status" <> 'CLOSED'
         AND (CASE WHEN ${isCredit}
                   THEN f."balance" - CAST(${amountNum.toFixed(2)} AS numeric) >= 0
                   ELSE TRUE END)
      RETURNING f."balance"
    `

    if (rows.length === 0) {
      const current = await prisma.folio.findUnique({ where: { id: folio.id } })
      if (!current) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
      }
      if (current.status === 'CLOSED') {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Cannot add transactions to a closed folio' } })
      }
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Payment would result in negative folio balance' } })
    }

    const transaction = await prisma.folioTransaction.create({
      data: {
        folioId: folio.id,
        type,
        category: typeof category === 'string' ? category : 'OTHER',
        description: typeof description === 'string' ? description : '',
        amount: amountNum,
        reference: typeof reference === 'string' ? reference : null,
        sourceId: typeof sourceId === 'string' ? sourceId : null,
        sourceType: typeof sourceType === 'string' ? sourceType : null,
        createdBy: req.user?.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        action: 'FOLIO_TRANSACTION',
        entity: 'FolioTransaction',
        entityId: transaction.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          folioId: folio.id,
          type,
          amount: amountNum.toFixed(2),
          balance: Number(rows[0].balance).toFixed(2),
        },
      },
    })

    return res.status(201).json({ success: true, data: transaction })
  },

  close: async (req: AuthenticatedRequest, res: Response) => {
    const folio = await prisma.folio.findFirst({ where: { id: req.params.id, property: { organizationId: req.user!.organizationId } } })
    if (!folio) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folio not found' } })
    const balance = Math.round(Number(folio.balance) * 100) / 100
    if (balance !== 0) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Folio balance is ${balance}. Please settle before closing.` } })
    }
    const closed = await prisma.folio.update({ where: { id: folio.id }, data: { status: 'CLOSED', closedAt: new Date() } })
    return res.json({ success: true, data: closed })
  },
}
