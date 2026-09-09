import { PrismaClient, PaymentStatus } from '@hospiflow/database'
import { BadRequestError, NotFoundError, ValidationError } from '../utils/errors'

const prisma = new PrismaClient()

export interface RefundResult {
  refund: any
  updatedPayment: any
  updatedFolio: any | null
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

export async function processRefund(
  paymentId: string,
  amount: number,
  reason: string,
  userId: string
): Promise<RefundResult> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Refund reason is required')
  }

  const amountCents = toCents(amount)
  if (amountCents <= 0) {
    throw new ValidationError('Refund amount must be greater than zero')
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  })

  if (!payment) {
    throw new NotFoundError('Payment not found')
  }

  if (payment.status !== 'COMPLETED' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new BadRequestError('Cannot refund unpaid or failed transaction')
  }

  const paidAmountCents = toCents(Number(payment.amount))

  const existingRefunds = await prisma.refund.findMany({
    where: { paymentId },
  })

  const totalRefundedCents = existingRefunds.reduce(
    (sum, r) => sum + toCents(Number(r.amount)),
    0
  )

  if (totalRefundedCents + amountCents > paidAmountCents) {
    throw new ValidationError('Refund amount exceeds remaining paid amount')
  }

  const duplicateRefund = existingRefunds.find(
    (r) => toCents(Number(r.amount)) === amountCents && (r.status === 'PENDING' || r.status === 'PROCESSED')
  )

  let refund
  if (duplicateRefund) {
    refund = duplicateRefund
  } else {
    refund = await prisma.refund.create({
      data: {
        paymentId,
        amount,
        reason,
        status: 'PROCESSED',
        approvedBy: userId,
        processedAt: new Date(),
      },
    })
  }

  const newTotalRefundedCents = totalRefundedCents + amountCents
  let newPaymentStatus: PaymentStatus = 'PARTIALLY_REFUNDED'
  if (newTotalRefundedCents >= paidAmountCents) {
    newPaymentStatus = 'REFUNDED'
  }

  const updatedPayment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: newPaymentStatus },
  })

  let updatedFolio: any = null

  const folioTransactions = await prisma.folioTransaction.findMany({
    where: {
      sourceId: paymentId,
      sourceType: 'PAYMENT',
    },
    include: { folio: true },
  })

  const folioIds = [...new Set(folioTransactions.map((ft) => ft.folioId))]

  for (const folioId of folioIds) {
    const folio = await prisma.folio.findUnique({ where: { id: folioId } })
    if (!folio) continue

    const currentBalanceCents = toCents(Number(folio.balance))
    const newBalanceCents = currentBalanceCents - amountCents

    updatedFolio = await prisma.folio.update({
      where: { id: folioId },
      data: {
        balance: newBalanceCents / 100,
        totalRefunds: { increment: amount },
      },
    })

    await prisma.folioTransaction.create({
      data: {
        folioId,
        type: 'REFUND',
        category: 'PAYMENT_REFUND',
        description: `Refund for payment ${paymentId}: ${reason}`,
        amount,
        reference: refund.id,
        sourceId: paymentId,
        sourceType: 'PAYMENT',
        createdBy: userId,
      },
    })
  }

  await prisma.auditLog.create({
    data: {
      organizationId: payment.organizationId,
      userId,
      action: 'REFUND',
      entity: 'Refund',
      entityId: refund.id,
      metadata: {
        paymentId,
        amount,
        reason,
        paymentStatus: updatedPayment.status,
        isDuplicate: !!duplicateRefund,
      },
    },
  })

  return {
    refund,
    updatedPayment,
    updatedFolio,
  }
}
