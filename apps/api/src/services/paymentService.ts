import { Request, Response } from 'express'
import { PrismaClient, PaymentStatus as PrismaPaymentStatus, PaymentProvider, PaymentMethod, Prisma } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { PaymentProviderFactory } from './payments'
import { PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './payments/types'
import { BadRequestError, NotFoundError, ConflictError, HttpError } from '../utils/errors'
import {
  MAX_MONEY_10_2,
  assertId,
  assertPaymentMethod,
  assertPaymentProvider,
  fromMinorUnits,
  isTerminalPaymentStatus,
  parseMonetaryAmount,
  reconcileOrderCollection,
  recordOrderCollection,
  storedProviderReference,
  toMinorUnits,
} from './financialIntegrity'

const prisma = new PrismaClient()

const factory = PaymentProviderFactory.getInstance()

/**
 * Metadata keys that the provider-callback resolver in paymentWebhookService
 * trusts to identify which payment a callback settles. They are written only by
 * the provider response, so a caller must never be able to set them through the
 * free-form `metadata` object on initiate — otherwise a caller could choose the
 * anchor an unauthenticated callback matches and settle their own payment.
 * Every other caller-supplied key is passed through unchanged.
 */
const PROVIDER_RESERVED_METADATA_KEYS = [
  'idempotencyKey',
  'checkoutRequestId',
  'providerResponse',
  'stripePaymentIntentId',
  'webhookProcessedAt',
  'verified',
  'verifiedBy',
  'verifiedAt',
  'verificationNotes',
  'rejectionNotes',
  'ledgerRefused',
  'status',
] as const

function sanitizeClientMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return {}
  }
  const reserved = new Set<string>(PROVIDER_RESERVED_METADATA_KEYS)
  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>).filter(([key]) => !reserved.has(key))
  )
}

function assertSameOrganization(orderId: string, organizationId: string): Promise<{ organizationId: string; outletId: string }> {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      outlet: {
        property: {
          organizationId,
        },
      },
    },
    include: {
      outlet: {
        include: {
          property: true,
        },
      },
    },
  }).then((order) => {
    if (!order) {
      throw new NotFoundError('Order not found or does not belong to your organization')
    }
    return {
      organizationId: order.outlet.property.organizationId,
      outletId: order.outletId,
    }
  })
}

/**
 * B40 — a provider must never be asked about an identifier HOSPIFLOW did not
 * store for this payment. Adapters receive the provider reference recorded at
 * initiation, never the internal row id. The MOCK adapter is a deterministic
 * local stub with no external identity, so a MOCK payment legitimately has no
 * stored provider reference and is settled using its internal row id; real
 * providers (M-Pesa/Bank/Stripe) still require the stored reference.
 */
function resolveProviderReference(
  payment: { id: string; reference?: string | null; metadata?: unknown },
  provider: string
): string {
  const reference = storedProviderReference(payment)
  if (reference) return reference
  if (provider === 'MOCK') return payment.id
  throw new ConflictError('Payment has no stored provider reference; it cannot be verified or refunded')
}

/**
 * B40 — the provider and currency reported by a callback/provider status query
 * must agree with the authoritative payment record, otherwise the payment is not
 * settled. A provider that reports no amount at all (M-Pesa STK status queries
 * do not) is not treated as contradicting the stored amount.
 */
function assertProviderReconciliation(
  payment: { amount: unknown; provider?: PaymentProvider | null },
  orderCurrency: string,
  response: PaymentResponse,
  source: string
): void {
  if (payment.provider && response.provider && payment.provider !== response.provider) {
    throw new BadRequestError(
      `Provider mismatch: payment is a ${payment.provider} payment but the ${source} response is ${response.provider}`
    )
  }

  if (response.currency && orderCurrency && response.currency.toUpperCase() !== String(orderCurrency).toUpperCase()) {
    throw new BadRequestError('Provider currency does not match the order currency')
  }

  const reported = toMinorUnits(response.amount)
  const stored = toMinorUnits(payment.amount)
  if (reported !== null && reported > 0 && stored !== null && reported !== stored) {
    throw new BadRequestError('Provider amount does not match the payment amount')
  }
}

/**
 * B40 — after any settlement, refund or status change the order's paid amount and
 * balance are recomputed from the authoritative payment rows. Returns the new
 * state so callers can report a refusal caused by the overpayment rule.
 */
export async function refreshOrderLedger(orderId: string): Promise<{ applied: boolean; total: number }> {
  return reconcileOrderCollection(prisma, orderId)
}

export const paymentService = {
  initiatePayment: async (req: AuthenticatedRequest, res: Response) => {
    const { orderId, amount, method, provider, phoneNumber, email, description, metadata, idempotencyKey } = req.body as PaymentRequest

    if (orderId === undefined || amount === undefined || method === undefined || provider === undefined) {
      throw new BadRequestError('orderId, amount, method, and provider are required')
    }

    const validatedOrderId = assertId(orderId, 'orderId')
    const amountDecimal = parseMonetaryAmount(amount, { field: 'amount', max: MAX_MONEY_10_2 })
    const paymentMethod = assertPaymentMethod(method) as PaymentMethod
    const paymentProvider = assertPaymentProvider(provider) as PaymentProvider

    if (idempotencyKey !== undefined && idempotencyKey !== null && typeof idempotencyKey !== 'string') {
      throw new BadRequestError('idempotencyKey must be a string', 'VALIDATION_ERROR')
    }

    const ctx = await assertSameOrganization(validatedOrderId, req.user!.organizationId)

    // Client metadata is caller-supplied free-form data. Strip the keys the
    // webhook resolver trusts before it reaches the database or the provider.
    const clientMetadata = sanitizeClientMetadata(metadata)

    // Only the configured adapter exists in this deployment. A caller cannot ask
    // for a provider that is not initialised.
    if (!factory.getAvailableProviders().includes(paymentProvider)) {
      throw new BadRequestError(
        `Payment provider ${paymentProvider} is not available in this deployment`,
        'VALIDATION_ERROR'
      )
    }

    let payment: { id: string } | null = null

    if (idempotencyKey) {
      // B36/B40 duplicate protection. The advisory lock serialises concurrent
      // requests carrying the same key so exactly one of them creates the
      // payment; the others observe the stored one.
      const created = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment:${validatedOrderId}:${idempotencyKey}`}))`

        const existing = await tx.orderPayment.findFirst({
          where: {
            orderId: validatedOrderId,
            metadata: {
              path: ['idempotencyKey'],
              equals: idempotencyKey,
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        if (existing) {
          // Reusing a key for a materially different request must not silently
          // replay the first result: the caller would believe it paid a figure
          // that was never recorded.
          const storedAmount = toMinorUnits(existing.amount)
          if (storedAmount !== null && storedAmount !== Math.round(amountDecimal * 100)) {
            throw new ConflictError(
              'Idempotency-Key has already been used for a different amount'
            )
          }
          if (existing.paymentMethod !== paymentMethod || (existing.provider ?? null) !== paymentProvider) {
            throw new ConflictError(
              'Idempotency-Key has already been used for a different payment method or provider'
            )
          }
          return { existing, created: null as null }
        }

        return {
          existing: null,
          created: await tx.orderPayment.create({
            data: {
              orderId: validatedOrderId,
              paymentMethod,
              amount: amountDecimal.toFixed(2),
              status: 'PENDING',
              provider: paymentProvider,
              metadata: {
                idempotencyKey: idempotencyKey || null,
                phoneNumber: phoneNumber || null,
                email: email || null,
                description: description || null,
                ...clientMetadata,
              },
            },
          }),
        }
      })

      if (created.existing) {
        const adapter = factory.getProvider(paymentProvider)
        const response = await adapter.getStatus(created.existing.id)
        return res.json({ success: true, data: response, idempotent: true })
      }
      payment = created.created as { id: string }
    } else {
      payment = await prisma.orderPayment.create({
        data: {
          orderId: validatedOrderId,
          paymentMethod,
          amount: amountDecimal.toFixed(2),
          status: 'PENDING',
          provider: paymentProvider,
          metadata: {
            phoneNumber: phoneNumber || null,
            email: email || null,
            description: description || null,
            ...clientMetadata,
          },
        },
      })
    }

    const stored = await prisma.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })
    const adapter = factory.getProvider(paymentProvider)

    const providerRequest: PaymentRequest = {
      orderId: validatedOrderId,
      amount: amountDecimal,
      method,
      provider: paymentProvider as PaymentRequest['provider'],
      phoneNumber,
      email,
      description,
      metadata: {
        ...clientMetadata,
        idempotencyKey: idempotencyKey || undefined,
      },
      idempotencyKey,
    }

    const response = await adapter.initiate(providerRequest)

    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: {
        reference: response.reference || stored.reference,
        metadata: {
          ...(typeof stored.metadata === 'object' && stored.metadata !== null ? stored.metadata : {}),
          checkoutRequestId: response.checkoutRequestId || undefined,
          clientSecret: response.clientSecret || undefined,
          providerResponse: JSON.parse(JSON.stringify(response)),
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: req.user!.id,
        action: 'PAYMENT_INITIATED',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          provider: paymentProvider,
          method: paymentMethod,
          amount: amountDecimal.toFixed(2),
          orderId: validatedOrderId,
        },
      },
    })

    return res.status(201).json({ success: true, data: response })
  },

  verifyPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId } = req.body ?? {}

    if (paymentId === undefined || paymentId === null || paymentId === '') {
      throw new BadRequestError('paymentId is required')
    }
    const validatedPaymentId = assertId(paymentId, 'paymentId')

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: validatedPaymentId,
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: {
          include: {
            outlet: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    })

    if (!payment) {
      throw new NotFoundError('Payment not found')
    }

    // B40 state machine: a terminal payment is never re-opened. Verifying an
    // already COMPLETED payment stays idempotent so repeated verification cannot
    // credit the order twice, but FAILED / CANCELLED / REFUNDED /
    // PARTIALLY_REFUNDED may never become COMPLETED again.
    if (payment.status === 'COMPLETED') {
      return res.json({
        success: true,
        data: {
          id: payment.id,
          status: 'SUCCEEDED',
          amount: Number(payment.amount),
          currency: payment.order.currency,
          provider: payment.provider ?? 'MOCK',
          method: payment.paymentMethod,
          reference: payment.reference ?? undefined,
          alreadySettled: true,
          createdAt: payment.createdAt,
        },
      })
    }

    if (isTerminalPaymentStatus(String(payment.status))) {
      throw new ConflictError(
        `Payment is ${payment.status} and cannot be completed by a verification`
      )
    }

    const provider = payment.provider || 'MOCK'
    const adapter = factory.getProvider(provider)
    const providerReference = resolveProviderReference(payment, provider)

    const response = await adapter.verify(providerReference)

    const organizationId = payment.order.outlet.property.organizationId

    if (response.status === 'SUCCEEDED') {
      assertProviderReconciliation(payment, payment.order.currency, response, provider)
    }

    const targetStatus: PrismaPaymentStatus | null =
      response.status === 'SUCCEEDED'
        ? 'COMPLETED'
        : response.status === 'FAILED'
          ? 'FAILED'
          : response.status === 'CANCELLED'
            ? 'CANCELLED'
            : null

    if (targetStatus === null) {
      await prisma.orderPayment.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
            verifiedAt: new Date().toISOString(),
            providerResponse: JSON.parse(JSON.stringify(response)),
          },
        },
      })
      return res.json({ success: true, data: response })
    }

    const settled = await prisma.$transaction(async (tx) => {
      const current = await tx.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })
      if (isTerminalPaymentStatus(String(current.status))) {
        throw new ConflictError(`Payment is ${current.status} and cannot be completed`)
      }

      const updateData: Record<string, unknown> = {
        status: targetStatus,
        paidAt: targetStatus === 'COMPLETED' ? new Date() : null,
        reference: response.reference || payment.reference,
        metadata: {
          ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
          verifiedAt: new Date().toISOString(),
          providerResponse: JSON.parse(JSON.stringify(response)),
        },
      }

      await tx.orderPayment.update({ where: { id: payment.id }, data: updateData as any })

      const ledger = await reconcileOrderCollection(tx as unknown as PrismaClient, payment.orderId)

      if (targetStatus === 'COMPLETED' && !ledger.applied) {
        await tx.orderPayment.update({
          where: { id: payment.id },
          data: {
            status: 'PENDING',
            paidAt: null,
            metadata: {
              ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata as Record<string, unknown> : {}),
              verifiedAt: new Date().toISOString(),
              providerResponse: JSON.parse(JSON.stringify(response)),
              ledgerRefused: true,
            },
          },
        })
        return { applied: false, orderExists: ledger.orderExists, paidAmount: 0, balance: ledger.balance, total: ledger.total }
      }

      return ledger
    })

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: req.user!.id,
        action: targetStatus === 'COMPLETED' ? 'PAYMENT_COMPLETED' : 'PAYMENT_FAILED',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          provider,
          amount: Number(payment.amount).toFixed(2),
          status: targetStatus,
          ledgerApplied: settled.applied,
        },
      },
    })

    if (targetStatus === 'COMPLETED' && !settled.applied) {
      console.warn(
        `[SECURITY] payment ${payment.id} verification refused: order collection would exceed the authoritative order total.`
      )
      return res.json({
        success: true,
        data: { ...response, settled: false, reason: 'ORDER_COLLECTION_EXCEEDED' },
      })
    }

    return res.json({ success: true, data: response })
  },

  refundPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId } = req.body ?? {}
    const { amount, reason } = req.body as RefundRequest

    if (paymentId === undefined || paymentId === null || paymentId === '') {
      throw new BadRequestError('paymentId is required')
    }
    const validatedPaymentId = assertId(paymentId, 'paymentId')

    // A refund must be a positive, finite amount that fits the money columns.
    // Validate before converting so a negative or unparsable client value is a
    // 400 and not an unhandled error.
    const refundMajor = parseMonetaryAmount(amount, { field: 'amount' })
    const refundAmount = toMinorUnits(refundMajor) as number

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: validatedPaymentId,
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: { include: { outlet: { include: { property: true } } } },
      },
    })

    if (!payment) {
      throw new NotFoundError('Payment not found')
    }

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestError('Only completed payments can be refunded')
    }

    const organizationId = payment.order.outlet.property.organizationId

    // B40 — two-phase refund. Phase one takes a row lock on the payment and
    // records the refund, so concurrent refunds of the same payment serialise and
    // can never each see the full remaining refundable amount. The provider call
    // happens outside the transaction.
    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OrderPayment" WHERE id = ${payment.id} FOR UPDATE`

      const current = await tx.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })

      if (current.status !== 'COMPLETED') {
        throw new BadRequestError('Only completed payments can be refunded')
      }

      const paymentAmount = toMinorUnits(current.amount) as number
      const existingRefunds = await tx.refund.findMany({ where: { paymentId: current.id } })
      const totalRefunded = existingRefunds.reduce((sum, r) => sum + (toMinorUnits(r.amount) as number), 0)
      const remainingRefundable = paymentAmount - totalRefunded

      if (refundAmount > remainingRefundable) {
        throw new BadRequestError(
          `Refund amount exceeds remaining refundable amount: ${fromMinorUnits(Math.max(remainingRefundable, 0)).toFixed(2)}`
        )
      }

      const refund = await tx.refund.create({
        data: {
          paymentId: current.id,
          amount: fromMinorUnits(refundAmount),
          reason: typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : 'Refund requested',
          status: 'PENDING',
          approvedBy: req.user!.id,
        },
      })

      return {
        refund,
        remainingRefundable,
        isFullRefund: refundAmount === remainingRefundable,
        amountMinor: refundAmount,
      }
    })

    const provider = payment.provider || 'MOCK'
    const adapter = factory.getProvider(provider)

    // A real provider must never be asked about an identifier HOSPIFLOW did not
    // store for this payment. The MOCK adapter is a deterministic local stub
    // with no external identity, so a MOCK payment legitimately has no stored
    // provider reference and is settled using its internal row id; real
    // providers (M-Pesa/Bank/Stripe) still require the stored reference.
    const providerReference = (() => {
      const ref = storedProviderReference(payment)
      if (ref) return ref
      if (provider === 'MOCK') return payment.id
      throw new ConflictError('Payment has no stored provider reference; it cannot be verified or refunded')
    })()

    const refundRequest: RefundRequest = {
      amount: fromMinorUnits(reservation.amountMinor),
      reason: reservation.refund.reason,
    }

    let refundResponse: RefundResponse
    try {
      refundResponse = await adapter.refund(providerReference, refundRequest)
    } catch (error) {
      // The money did not move at the provider. Record the failure so the audit
      // trail is complete, and tell the caller nothing about the provider.
      await prisma.refund.update({ where: { id: reservation.refund.id }, data: { status: 'FAILED' } })
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: req.user!.id,
          action: 'PAYMENT_REFUND_FAILED',
          entity: 'Refund',
          entityId: reservation.refund.id,
          ip: req.ip || undefined,
          userAgent: req.headers['user-agent'] || undefined,
          metadata: { provider, paymentId: payment.id, amount: fromMinorUnits(reservation.amountMinor).toFixed(2) },
        },
      })
      throw new HttpError(502, 'PROVIDER_ERROR', 'The payment provider could not process this refund')
    }

    const providerSucceeded = refundResponse.status === 'SUCCEEDED' || refundResponse.status === 'COMPLETED'
    const refundStatus = providerSucceeded ? 'COMPLETED' : 'PENDING'

    await prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: reservation.refund.id },
        data: {
          status: refundStatus,
          processedAt: refundResponse.processedAt || new Date(),
        },
      })

      if (!providerSucceeded) {
        // The provider has not confirmed the refund, so the payment stays
        // COMPLETED and the money stays collected.
        return
      }

      await tx.orderPayment.update({
        where: { id: payment.id },
        data: {
          status: reservation.isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      })

      await reconcileOrderCollection(tx as unknown as PrismaClient, payment.orderId)

      // A POS order payment is not a hotel folio posting, so the refund is
      // reconciled against the order ledger above rather than against a folio.
      // The lookup requires a folio whose reservation is the paid order, which
      // the schema cannot represent for a POS order.
      const folio = await tx.folio.findFirst({
        where: {
          reservationId: payment.orderId,
          property: { organizationId },
        },
      })

      if (folio) {
        await tx.folioTransaction.create({
          data: {
            folioId: folio.id,
            type: 'REFUND',
            category: 'PAYMENT',
            description: `Refund for payment ${payment.id}`,
            amount: fromMinorUnits(reservation.amountMinor),
            reference: reservation.refund.id,
            sourceId: payment.id,
            sourceType: 'OrderPayment',
            createdBy: req.user!.id,
          },
        })

        await tx.folio.update({
          where: { id: folio.id },
          data: {
            totalRefunds: { increment: fromMinorUnits(reservation.amountMinor) },
            balance: { increment: fromMinorUnits(reservation.amountMinor) },
          },
        })
      }
    })

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: req.user!.id,
        action: 'PAYMENT_REFUNDED',
        entity: 'Refund',
        entityId: reservation.refund.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          provider,
          paymentId: payment.id,
          amount: fromMinorUnits(reservation.amountMinor).toFixed(2),
          full: reservation.isFullRefund,
          providerConfirmed: providerSucceeded,
        },
      },
    })

    return res.status(201).json({ success: true, data: { ...refundResponse, id: reservation.refund.id } })
  },

  getPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params
    const validatedId = assertId(id, 'id')

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: validatedId,
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: {
          include: {
            outlet: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    })

    if (!payment) {
      throw new NotFoundError('Payment not found')
    }

    return res.json({ success: true, data: payment })
  },

  listPayments: async (req: AuthenticatedRequest, res: Response) => {
    const { status, provider, from, to, page = '1', limit = '20' } = req.query as Record<string, string>

    const where: any = {
      order: {
        outlet: {
          property: {
            organizationId: req.user!.organizationId,
          },
        },
      },
    }

    // B40 — filter values are validated against the authoritative enums so a
    // hostile query value is a client error rather than a database error.
    if (status) {
      if (!['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'].includes(status)) {
        throw new BadRequestError('Invalid payment status filter', 'VALIDATION_ERROR')
      }
      where.status = status as PrismaPaymentStatus
    }
    if (provider) {
      where.provider = assertPaymentProvider(provider) as PaymentProvider
    }
    if (from) {
      const parsedFrom = new Date(from)
      if (Number.isNaN(parsedFrom.getTime())) {
        throw new BadRequestError('Invalid from date', 'VALIDATION_ERROR')
      }
      where.createdAt = { ...where.createdAt, gte: parsedFrom }
    }
    if (to) {
      const parsedTo = new Date(to)
      if (Number.isNaN(parsedTo.getTime())) {
        throw new BadRequestError('Invalid to date', 'VALIDATION_ERROR')
      }
      where.createdAt = { ...where.createdAt, lte: parsedTo }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    const skip = (pageNum - 1) * limitNum

    const [payments, total] = await Promise.all([
      prisma.orderPayment.findMany({
        where,
        include: {
          order: {
            include: {
              outlet: {
                include: {
                  property: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.orderPayment.count({ where }),
    ])

    return res.json({
      success: true,
      data: payments,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  },

  submitBankPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { orderId, amount, bankName, bankAccountReference, description, metadata, idempotencyKey } = req.body as {
      orderId: string
      amount: unknown
      bankName: string
      bankAccountReference?: string
      description?: string
      metadata?: Record<string, unknown>
      idempotencyKey?: string
    }

    if (!orderId || amount === undefined || !bankName) {
      throw new BadRequestError('orderId, amount, and bankName are required for bank payment submission')
    }

    const validatedOrderId = assertId(orderId, 'orderId')
    const amountDecimal = parseMonetaryAmount(amount, { field: 'amount', max: MAX_MONEY_10_2 })
    const ctx = await assertSameOrganization(validatedOrderId, req.user!.organizationId)

    // B40 — refuse payments against orders that are not in a collectable state.
    const orderRecord = await prisma.order.findUniqueOrThrow({
      where: { id: validatedOrderId },
      select: { status: true },
    })
    if (orderRecord.status === 'CANCELLED') {
      throw new BadRequestError('Cannot submit a payment for a cancelled order', 'INVALID_ORDER_STATE')
    }

    if (idempotencyKey !== undefined && idempotencyKey !== null && typeof idempotencyKey !== 'string') {
      throw new BadRequestError('idempotencyKey must be a string', 'VALIDATION_ERROR')
    }

    if (!factory.getAvailableProviders().includes('BANK')) {
      throw new BadRequestError('Bank payment provider is not available in this deployment', 'VALIDATION_ERROR')
    }

    const adapter = factory.getProvider('BANK')
    const clientMetadata = sanitizeClientMetadata(metadata)
    const trimmedBankName = bankName.trim()
    const trimmedReference = bankAccountReference ? String(bankAccountReference).trim() : null

    const baseMetadata: Record<string, unknown> = {
      bankName: trimmedBankName,
      bankAccountReference: trimmedReference,
      description: description || null,
      ...clientMetadata,
    }
    if (idempotencyKey) {
      baseMetadata.idempotencyKey = idempotencyKey
    }

    let payment: { id: string } | null = null

    if (idempotencyKey) {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bank:${validatedOrderId}:${idempotencyKey}`}))`

        const existing = await tx.orderPayment.findFirst({
          where: {
            orderId: validatedOrderId,
            metadata: {
              path: ['idempotencyKey'],
              equals: idempotencyKey,
            },
          },
          orderBy: { createdAt: 'desc' },
        })

        if (existing) {
          const storedAmount = toMinorUnits(existing.amount)
          if (storedAmount !== null && storedAmount !== Math.round(amountDecimal * 100)) {
            throw new ConflictError('Idempotency-Key has already been used for a different amount')
          }
          if (existing.paymentMethod !== 'BANK_TRANSFER' || (existing.provider ?? null) !== 'BANK') {
            throw new ConflictError('Idempotency-Key has already been used for a different payment method or provider')
          }
          return { existing, created: null as null }
        }

        return {
          existing: null,
          created: await tx.orderPayment.create({
            data: {
              orderId: validatedOrderId,
              paymentMethod: 'BANK_TRANSFER',
              amount: amountDecimal.toFixed(2),
              status: 'PENDING',
              provider: 'BANK',
              metadata: baseMetadata as unknown as Prisma.InputJsonValue,
            },
          }),
        }
      })

      if (result.existing) {
        const response = await adapter.getStatus(result.existing.id)
        return res.json({ success: true, data: response, idempotent: true })
      }
      payment = result.created as { id: string }
    } else {
      payment = await prisma.orderPayment.create({
        data: {
          orderId: validatedOrderId,
          paymentMethod: 'BANK_TRANSFER',
          amount: amountDecimal.toFixed(2),
          status: 'PENDING',
          provider: 'BANK',
          metadata: baseMetadata as unknown as Prisma.InputJsonValue,
        },
      })
    }

    const stored = await prisma.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })

    const response = await adapter.initiate({
      orderId: validatedOrderId,
      amount: amountDecimal,
      method: 'BANK_TRANSFER',
      provider: 'BANK',
      description,
      metadata: clientMetadata,
      idempotencyKey,
    })

    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: {
        reference: response.reference || stored.reference,
        metadata: {
          ...(typeof stored.metadata === 'object' && stored.metadata !== null ? stored.metadata : {}),
          checkoutRequestId: response.checkoutRequestId || undefined,
          providerResponse: JSON.parse(JSON.stringify(response)),
        },
      },
    })

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        userId: req.user!.id,
        action: 'PAYMENT_INITIATED',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          provider: 'BANK',
          method: 'BANK_TRANSFER',
          amount: amountDecimal.toFixed(2),
          orderId: validatedOrderId,
          bankName: trimmedBankName,
          bankAccountReference: trimmedReference,
          bankAction: 'SUBMITTED',
        },
      },
    })

    return res.status(201).json({ success: true, data: response })
  },

  verifyBankPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId, verificationNotes } = req.body as {
      paymentId: string
      verificationNotes?: string
    }

    if (!paymentId) {
      throw new BadRequestError('paymentId is required')
    }
    const validatedPaymentId = assertId(paymentId, 'paymentId')

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: validatedPaymentId,
        provider: 'BANK',
        paymentMethod: 'BANK_TRANSFER',
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: {
          include: {
            outlet: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    })

    if (!payment) {
      throw new NotFoundError('Bank payment not found')
    }

    const organizationId = payment.order.outlet.property.organizationId

    // B40 — re-verifying an already-COMPLETED payment is idempotent.
    if (payment.status === 'COMPLETED') {
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: req.user!.id,
          action: 'PAYMENT_COMPLETED',
          entity: 'OrderPayment',
          entityId: payment.id,
          ip: req.ip || undefined,
          userAgent: req.headers['user-agent'] || undefined,
          metadata: {
            provider: 'BANK',
            amount: Number(payment.amount).toFixed(2),
            ledgerApplied: true,
            bankAction: 'VERIFIED',
            verifiedBy: req.user!.id,
            idempotent: true,
          },
        },
      })
      return res.json({ success: true, data: { status: 'COMPLETED', settled: true, idempotent: true } })
    }

    if (payment.status !== 'PENDING') {
      throw new ConflictError(`Bank payment is ${payment.status} and cannot be verified`)
    }

    const settled = await prisma.$transaction(async (tx) => {
      const current = await tx.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })
      if (current.status !== 'PENDING') {
        throw new ConflictError(`Bank payment is ${current.status} and cannot be verified`)
      }

      await tx.orderPayment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          metadata: {
            ...(typeof current.metadata === 'object' && current.metadata !== null ? current.metadata as Record<string, unknown> : {}),
            verifiedBy: req.user!.id,
            verifiedAt: new Date().toISOString(),
            verificationNotes: verificationNotes && String(verificationNotes).trim() !== '' ? String(verificationNotes).trim() : null,
          },
        },
      })

      const ledger = await reconcileOrderCollection(tx as unknown as PrismaClient, payment.orderId)

      if (!ledger.applied) {
        await tx.orderPayment.update({
          where: { id: payment.id },
          data: {
            status: 'PENDING',
            paidAt: null,
            metadata: {
              ...(typeof current.metadata === 'object' && current.metadata !== null ? current.metadata as Record<string, unknown> : {}),
              verifiedBy: req.user!.id,
              verifiedAt: new Date().toISOString(),
              verificationNotes: verificationNotes && String(verificationNotes).trim() !== '' ? String(verificationNotes).trim() : null,
              ledgerRefused: true,
            },
          },
        })
        return { applied: false }
      }

      return { applied: true }
    })

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: req.user!.id,
        action: 'PAYMENT_COMPLETED',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          provider: 'BANK',
          amount: Number(payment.amount).toFixed(2),
          ledgerApplied: settled.applied,
          bankAction: 'VERIFIED',
          verifiedBy: req.user!.id,
          verificationNotes: verificationNotes || null,
        },
      },
    })

    if (!settled.applied) {
      console.warn(
        `[SECURITY] bank payment ${payment.id} verification refused: order collection would exceed the authoritative order total.`
      )
      return res.json({
        success: true,
        data: { status: 'PENDING', settled: false, reason: 'ORDER_COLLECTION_EXCEEDED' },
      })
    }

    return res.json({ success: true, data: { status: 'COMPLETED', settled: true } })
  },

  rejectBankPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId, rejectionNotes } = req.body as {
      paymentId: string
      rejectionNotes?: string
    }

    if (!paymentId) {
      throw new BadRequestError('paymentId is required')
    }
    const validatedPaymentId = assertId(paymentId, 'paymentId')

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: validatedPaymentId,
        provider: 'BANK',
        paymentMethod: 'BANK_TRANSFER',
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: {
          include: {
            outlet: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    })

    if (!payment) {
      throw new NotFoundError('Bank payment not found')
    }

    if (payment.status !== 'PENDING') {
      throw new ConflictError(`Bank payment is ${payment.status} and cannot be rejected`)
    }

    const organizationId = payment.order.outlet.property.organizationId

    await prisma.$transaction(async (tx) => {
      const current = await tx.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })
      if (current.status !== 'PENDING') {
        throw new ConflictError(`Bank payment is ${current.status} and cannot be rejected`)
      }

      await tx.orderPayment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          paidAt: null,
          metadata: {
            ...(typeof current.metadata === 'object' && current.metadata !== null ? current.metadata as Record<string, unknown> : {}),
            verifiedBy: req.user!.id,
            verifiedAt: new Date().toISOString(),
            rejectionNotes: rejectionNotes && String(rejectionNotes).trim() !== '' ? String(rejectionNotes).trim() : null,
          },
        },
      })
    })

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: req.user!.id,
        action: 'PAYMENT_FAILED',
        entity: 'OrderPayment',
        entityId: payment.id,
        ip: req.ip || undefined,
        userAgent: req.headers['user-agent'] || undefined,
        metadata: {
          provider: 'BANK',
          amount: Number(payment.amount).toFixed(2),
          bankAction: 'REJECTED',
          verifiedBy: req.user!.id,
          rejectionNotes: rejectionNotes || null,
        },
      },
    })

    return res.json({ success: true, data: { status: 'FAILED', settled: false } })
  },
}

export { recordOrderCollection }