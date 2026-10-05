import crypto from 'crypto'
import { Response } from 'express'
import { PrismaClient, PaymentStatus } from '@hospiflow/database'
import { config } from '../config'
import { PaymentResponse } from './payments/types'
import { reconcileOrderCollection } from './financialIntegrity'

const prisma = new PrismaClient()

/**
 * M-Pesa STK callbacks are not cryptographically signed by Safaricom, so the
 * only meaningful control is a shared secret that the operator configures and
 * the integration proxy/allow-list forwards. When MPESA_WEBHOOK_SECRET is set
 * the callback must present it in `x-hospiflow-webhook-secret`.
 *
 * B40: production and staging fail CLOSED when the secret is absent, because an
 * unauthenticated external actor must not be able to forge a successful M-Pesa
 * callback. Development and test keep the previous permissive behaviour so a
 * local sandbox without a proxy still works, and the risk is logged loudly.
 */
let warnedMissingSecret = false

export function verifyWebhookSecret(headerValue: string | undefined, source: string): boolean {
  const expected = config.mpesaWebhookSecret
  const isProtectedEnvironment = config.nodeEnv === 'production' || config.nodeEnv === 'staging'

  if (!expected) {
    if (isProtectedEnvironment) {
      console.error(
        `[SECURITY] REFUSING ${source} callback: MPESA_WEBHOOK_SECRET is not configured while NODE_ENV=${config.nodeEnv}. ` +
          'Set MPESA_WEBHOOK_SECRET (or route the provider callback through an authenticating proxy that injects x-hospiflow-webhook-secret).'
      )
      return false
    }
    if (!warnedMissingSecret) {
      warnedMissingSecret = true
      console.warn(
        `[SECURITY] ${source} webhook accepted without signature verification because MPESA_WEBHOOK_SECRET is not configured. ` +
          'This is only tolerated outside production/staging.'
      )
    }
    return true
  }
  if (typeof headerValue !== 'string' || headerValue.length === 0) return false
  const a = Buffer.from(headerValue)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function toMinorUnits(amount: unknown): number | null {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount))
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100)
}

/**
 * Resolves the local payment a provider callback refers to using only the
 * provider identifiers HOSPIFLOW itself stored when the payment was initiated.
 * A callback can therefore never point at an arbitrary payment row, and it can
 * never carry tenant context: the organization is derived from the resolved
 * payment's own order.
 */
async function resolvePayment(providerId: string, reference?: string) {
  const candidates = [providerId, reference].filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (candidates.length === 0) return null

  return prisma.orderPayment.findFirst({
    where: {
      OR: candidates.flatMap((value) => [
        { metadata: { path: ['providerResponse', 'id'], equals: value } },
        { metadata: { path: ['checkoutRequestId'], equals: value } },
        { metadata: { path: ['stripePaymentIntentId'], equals: value } },
        { reference: value },
      ]),
    },
    include: {
      order: { include: { outlet: { include: { property: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

function nextStatus(response: PaymentResponse): PaymentStatus | null {
  if (response.status === 'SUCCEEDED') return PaymentStatus.COMPLETED
  if (response.status === 'FAILED') return PaymentStatus.FAILED
  if (response.status === 'CANCELLED') return PaymentStatus.CANCELLED
  return null
}

/**
 * Applies a provider callback to a payment the tenant already owns.
 *
 * B40 hardening applied here:
 *  * the callback's provider must match the provider recorded on the payment,
 *  * the callback's currency must match the order's authoritative currency,
 *  * the callback's amount must equal the stored payment amount,
 *  * the order's paid amount and balance are recomputed from the authoritative
 *    payment rows, and a settlement that would push the collected total past the
 *    order's own authoritative total is refused,
 *  * terminal payments are never transitioned again, so replaying a callback can
 *    never re-open, re-complete or re-credit a settled payment.
 */
export async function applyProviderWebhook(
  source: string,
  response: PaymentResponse | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!response) {
    return { status: 200, body: { success: true, message: 'Webhook received but no action taken' } }
  }

  const payment = await resolvePayment(response.id, response.reference)
  if (!payment) {
    return { status: 200, body: { success: true, message: 'Webhook received but no action taken' } }
  }

  const organizationId = payment.order.outlet.property.organizationId
  const targetStatus = nextStatus(response)

  if (targetStatus === null) {
    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
          webhookProcessedAt: new Date().toISOString(),
          providerResponse: JSON.parse(JSON.stringify(response)),
        },
      },
    })
    return { status: 200, body: { success: true, message: 'Webhook recorded' } }
  }

  const terminalStatuses: string[] = [
    PaymentStatus.COMPLETED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.REFUNDED,
    PaymentStatus.PARTIALLY_REFUNDED,
  ]
  const isTerminal = terminalStatuses.includes(String(payment.status))

  if (isTerminal) {
    return { status: 200, body: { success: true, message: 'Webhook already applied' } }
  }

  // B40 — the provider identity must be part of the authoritative relationship.
  // A Stripe event may not settle an M-Pesa payment or vice versa.
  if (payment.provider && response.provider && payment.provider !== response.provider) {
    console.warn(
      `[SECURITY] ${source} webhook provider mismatch for payment ${payment.id} (stored ${payment.provider}, callback ${response.provider}); not applying.`
    )
    return { status: 200, body: { success: true, message: 'Webhook provider mismatch; no action taken' } }
  }

  // B40 — a payment must not silently settle in a different currency from the
  // authoritative financial record.
  const orderCurrency = String(payment.order.currency || '').toUpperCase()
  const callbackCurrency = typeof response.currency === 'string' ? response.currency.toUpperCase() : ''
  if (callbackCurrency && orderCurrency && callbackCurrency !== orderCurrency) {
    console.warn(
      `[SECURITY] ${source} webhook currency mismatch for payment ${payment.id} (order ${orderCurrency}, callback ${callbackCurrency}); not marking payment completed.`
    )
    return { status: 200, body: { success: true, message: 'Webhook currency mismatch; no action taken' } }
  }

  if (targetStatus === PaymentStatus.COMPLETED) {
    const callbackAmount = toMinorUnits(response.amount)
    const storedAmount = toMinorUnits(payment.amount)
    if (callbackAmount === null || storedAmount === null || callbackAmount !== storedAmount) {
      console.warn(
        `[SECURITY] ${source} webhook amount mismatch for payment ${payment.id} (expected ${String(payment.amount)}, received ${String(response.amount)}); not marking payment completed.`
      )
      return { status: 200, body: { success: true, message: 'Webhook amount mismatch; no action taken' } }
    }
  }

    const applied = await prisma.$transaction(async (tx) => {
    const current = await tx.orderPayment.findUniqueOrThrow({ where: { id: payment.id } })

    // Re-check terminality inside the transaction so concurrent deliveries of the
    // same event cannot both apply.
    if (terminalStatuses.includes(String(current.status))) {
      return { alreadyApplied: true, ledgerApplied: true }
    }

    const updateData: Record<string, unknown> = {
      metadata: {
        ...(typeof current.metadata === 'object' && current.metadata !== null ? current.metadata : {}),
        webhookProcessedAt: new Date().toISOString(),
        providerResponse: JSON.parse(JSON.stringify(response)),
      },
    }
    if (targetStatus === PaymentStatus.COMPLETED) updateData.paidAt = new Date()
    if (response.reference) updateData.reference = response.reference
    updateData.status = targetStatus

    await tx.orderPayment.update({ where: { id: payment.id }, data: updateData as any })

    const ledger = await reconcileOrderCollection(tx as unknown as PrismaClient, payment.orderId)

    if (targetStatus === PaymentStatus.COMPLETED && !ledger.applied) {
      await tx.orderPayment.update({
        where: { id: payment.id },
        data: {
          status: 'PENDING',
          paidAt: null,
          metadata: {
            ...(typeof current.metadata === 'object' && current.metadata !== null ? current.metadata as Record<string, unknown> : {}),
            webhookProcessedAt: new Date().toISOString(),
            providerResponse: JSON.parse(JSON.stringify(response)),
            ledgerRefused: true,
          },
        },
      })
      return { alreadyApplied: false, ledgerApplied: false }
    }

    return { alreadyApplied: false, ledgerApplied: ledger.applied }
  })

  if (applied.alreadyApplied) {
    return { status: 200, body: { success: true, message: 'Webhook already applied' } }
  }

  await prisma.auditLog.create({
    data: {
      organizationId,
      action: 'PAYMENT',
      entity: 'OrderPayment',
      entityId: payment.id,
      metadata: {
        source,
        providerStatus: response.status,
        provider: response.provider,
        amount: Number(payment.amount).toFixed(2),
        ledgerApplied: applied.ledgerApplied,
      },
    },
  })

  if (targetStatus === PaymentStatus.COMPLETED && !applied.ledgerApplied) {
    console.warn(
      `[SECURITY] ${source} webhook for payment ${payment.id} refused: order collection would exceed the authoritative order total. Payment reverted to PENDING.`
    )
    return { status: 200, body: { success: true, message: 'Webhook rejected: order collection would exceed the order total' } }
  }

  return { status: 200, body: { success: true } }
}

export function webhookErrorResponse(res: Response, source: string, error: unknown) {
  console.error(`${source} webhook error:`, error instanceof Error ? error.message : String(error))
  return res.status(400).json({ success: false, error: { code: 'WEBHOOK_ERROR', message: `Invalid ${source} callback` } })
}
