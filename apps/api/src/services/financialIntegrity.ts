import type { PrismaClient } from '@hospiflow/database'
import { BadRequestError } from '../utils/errors'

/**
 * B40 — shared financial integrity primitives.
 *
 * Every monetary value that crosses the API boundary is parsed here so that a
 * hostile value is always a 4xx client error rather than an unhandled 500, and
 * so that the authoritative order ledger is written with single atomic SQL
 * statements that a concurrent request cannot interleave with.
 *
 * The database stores money as `Decimal(10,2)` on orders/order items and
 * `Decimal(12,2)` on folios and refunds, so a value that does not fit its
 * column is rejected before it reaches Prisma rather than becoming a database
 * error.
 */

/** Largest value `Decimal(10,2)` can hold (OrderPayment.amount, Order.total, ...). */
export const MAX_MONEY_10_2 = 99999999.99
/** Largest value `Decimal(12,2)` can hold (Folio columns, Refund.amount). */
export const MAX_MONEY_12_2 = 9999999999.99

export interface MonetaryOptions {
  field?: string
  /** Reject zero. Default true — a financial amount must be positive. */
  allowZero?: boolean
  max?: number
}

/**
 * Parses an untrusted client value into a positive, finite, 2-decimal monetary
 * amount. Rejects type confusion (arrays/objects/booleans) explicitly rather
 * than relying on string coercion.
 */
export function parseMonetaryAmount(value: unknown, options: MonetaryOptions = {}): number {
  const field = options.field ?? 'amount'
  const max = options.max ?? MAX_MONEY_10_2

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new BadRequestError(`${field} must be a number`)
  }
  if (typeof value === 'string' && value.trim() === '') {
    throw new BadRequestError(`${field} must be a number`)
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new BadRequestError(`${field} must be a finite number`)
  }
  if (options.allowZero ? parsed < 0 : parsed <= 0) {
    throw new BadRequestError(`${field} must be a positive number`)
  }
  if (parsed > max) {
    throw new BadRequestError(`${field} exceeds the maximum supported value`)
  }

  return Math.round(parsed * 100) / 100
}

/** Same as {@link parseMonetaryAmount} but a zero amount is permitted. */
export function parseSignedMonetaryAmount(value: unknown, options: MonetaryOptions = {}): number {
  return parseMonetaryAmount(value, { ...options, allowZero: true })
}

export function toMinorUnits(value: unknown): number | null {
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100)
}

export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100
}

/**
 * Records a collection of `amount` against an order's authoritative ledger.
 *
 * This is one SQL statement guarded by `balance >= amount`. PostgreSQL takes a
 * row lock for the update, so two concurrent collections serialise: at most one
 * of them can observe the remaining balance and both can never succeed for the
 * same money. Returns false when the order does not exist or the authoritative
 * balance cannot cover the amount.
 */
export async function recordOrderCollection(
  db: PrismaClient,
  orderId: string,
  amount: number
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "Order" o
       SET "paidAmount" = o."paidAmount" + CAST(${amount.toFixed(2)} AS numeric),
           "balance"     = o."balance"     - CAST(${amount.toFixed(2)} AS numeric),
           "updatedAt"   = NOW()
     WHERE o."id" = ${orderId}
       AND o."balance" >= CAST(${amount.toFixed(2)} AS numeric)
    RETURNING o."id"
  `
  return rows.length > 0
}

export interface OrderLedgerState {
  applied: boolean
  orderExists: boolean
  paidAmount: number
  balance: number
  total: number
}

/**
 * Recomputes an order's paid amount and balance from the authoritative payment
 * rows and refuses to apply the result when the collected total would exceed the
 * order's own authoritative total.
 *
 * One SQL statement, so a concurrent settlement cannot interleave with it: the
 * aggregate it reads and the value it writes are the same statement, and the
 * row lock serialises competing settlements.
 */
export async function reconcileOrderCollection(
  db: PrismaClient,
  orderId: string
): Promise<OrderLedgerState> {
  const rows = await db.$queryRaw<Array<{ paidAmount: string; balance: string; total: string }>>`
    UPDATE "Order" o
       SET "paidAmount" = agg."paid",
           "balance"     = o."total" - agg."paid",
           "updatedAt"   = NOW()
      FROM (
        SELECT COALESCE(SUM(p."amount"), 0) AS "paid"
          FROM "OrderPayment" p
         WHERE p."orderId" = ${orderId}
           AND p."status" = 'COMPLETED'
      ) agg
     WHERE o."id" = ${orderId}
       AND agg."paid" <= o."total"
    RETURNING o."paidAmount", o."balance", o."total"
  `

  if (rows.length > 0) {
    const row = rows[0]
    return {
      applied: true,
      orderExists: true,
      paidAmount: Number(row.paidAmount),
      balance: Number(row.balance),
      total: Number(row.total),
    }
  }

  const order = await db.order.findUnique({ where: { id: orderId }, select: { total: true } })
  return {
    applied: false,
    orderExists: order !== null,
    paidAmount: 0,
    balance: 0,
    total: order ? Number(order.total) : 0,
  }
}

/**
 * The provider-side identifier HOSPIFLOW itself stored when the payment was
 * initiated. Adapters must be called with this, never with the internal row id,
 * so a provider object can only ever act on the payment it belongs to.
 */
export function storedProviderReference(payment: {
  reference?: string | null
  metadata?: unknown
}): string | null {
  const metadata =
    payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {}
  const providerResponse =
    metadata.providerResponse && typeof metadata.providerResponse === 'object'
      ? (metadata.providerResponse as Record<string, unknown>)
      : {}

  const candidates = [
    providerResponse.id,
    metadata.stripePaymentIntentId,
    metadata.checkoutRequestId,
    payment.reference,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return null
}

/** Payment statuses that a later provider report or client request may not re-open. */
export const TERMINAL_PAYMENT_STATUSES = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const

export function isTerminalPaymentStatus(status: string): boolean {
  return (TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(status)
}

/** The only status from which a settlement (COMPLETED) is still permitted. */
export const SETTLEABLE_PAYMENT_STATUS = 'PENDING'

const PAYMENT_METHODS = ['CASH', 'CARD', 'MPESA', 'BANK_TRANSFER', 'ROOM_CHARGE', 'STRIPE', 'OTHER'] as const
const PAYMENT_PROVIDERS = ['MPESA', 'STRIPE', 'CARD', 'BANK', 'MOCK'] as const

export function assertPaymentMethod(value: unknown): string {
  if (typeof value !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(value)) {
    throw new BadRequestError(`method must be one of: ${PAYMENT_METHODS.join(', ')}`, 'VALIDATION_ERROR')
  }
  return value
}

export function assertPaymentProvider(value: unknown): string {
  if (typeof value !== 'string' || !(PAYMENT_PROVIDERS as readonly string[]).includes(value)) {
    throw new BadRequestError(`provider must be one of: ${PAYMENT_PROVIDERS.join(', ')}`, 'VALIDATION_ERROR')
  }
  return value
}

export function assertId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) {
    throw new BadRequestError(`${field} must be a non-empty identifier`, 'VALIDATION_ERROR')
  }
  return value
}