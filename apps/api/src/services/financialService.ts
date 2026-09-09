import { PrismaClient, Order, OrderItem, PaymentStatus } from '@hospiflow/database'
import { BadRequestError, NotFoundError, ValidationError } from '../utils/errors'
import { calculateTaxes, TaxInput, TaxResult } from './taxEngine'
import { calculateDiscount, DiscountInput, DiscountResult } from './discountEngine'

const prisma = new PrismaClient()

export function validatePaymentAmount(amount: number, balance: number): void {
  const amountCents = Math.round(amount * 100)
  const balanceCents = Math.round(balance * 100)

  if (amountCents <= 0) {
    throw new ValidationError('Payment amount must be greater than zero')
  }

  if (amountCents > balanceCents) {
    throw new ValidationError('Payment amount exceeds balance')
  }
}

export async function calculateOrderTotal(
  order: Order,
  items: OrderItem[],
  taxRules: any[],
  discountInput?: DiscountInput
): Promise<{
  subtotal: number
  discount: number
  taxableSubtotal: number
  tax: number
  total: number
  taxBreakdown: TaxResult
  discountBreakdown: DiscountResult | null
}> {
  const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0)
  const roundedSubtotal = Math.round(subtotal * 100) / 100

  let discountBreakdown: DiscountResult | null = null
  let afterDiscount = roundedSubtotal

  if (discountInput) {
    discountBreakdown = calculateDiscount(roundedSubtotal, discountInput, 'CASHIER', [])
    afterDiscount = Math.round(discountBreakdown.finalAmount * 100) / 100
  }

  const taxInput: TaxInput = {
    subtotal: afterDiscount,
    taxRules: taxRules as any[],
    items: items.map((item) => ({
      price: Number(item.unitPrice),
    })),
    pricingMode: 'EXCLUSIVE',
  }

  const taxBreakdown = await calculateTaxes(taxInput)

  return {
    subtotal: roundedSubtotal,
    discount: discountBreakdown ? Math.round(discountBreakdown.discountAmount * 100) / 100 : 0,
    taxableSubtotal: taxBreakdown.taxableSubtotal,
    tax: taxBreakdown.totalTax,
    total: taxBreakdown.grandTotal,
    taxBreakdown,
    discountBreakdown,
  }
}

export async function applyPaymentToFolio(
  folioId: string,
  amount: number,
  type: string,
  userId: string,
  reference?: string,
  sourceId?: string,
  sourceType?: string
): Promise<{
  transaction: any
  folio: any
}> {
  const folio = await prisma.folio.findUnique({ where: { id: folioId } })
  if (!folio) {
    throw new NotFoundError('Folio not found')
  }

  if (folio.status === 'CLOSED') {
    throw new BadRequestError('Cannot apply payment to a closed folio')
  }

  const amountCents = Math.round(amount * 100)
  if (amountCents <= 0) {
    throw new ValidationError('Payment amount must be greater than zero')
  }

  const currentBalanceCents = Math.round(Number(folio.balance) * 100)
  const newBalanceCents = currentBalanceCents - amountCents

  if (newBalanceCents < 0) {
    throw new ValidationError('Payment would result in negative folio balance')
  }

  const transaction = await prisma.folioTransaction.create({
    data: {
      folioId,
      type: type === 'ROOM_CHARGE' ? 'CHARGE' : 'PAYMENT',
      category: type,
      description: `Payment of ${amount} via ${type}`,
      amount,
      reference,
      sourceId: sourceId || undefined,
      sourceType: sourceType || undefined,
      createdBy: userId,
    },
  })

  const updateData: any = {
    balance: newBalanceCents / 100,
    totalPayments: { increment: amount },
  }

  const updatedFolio = await prisma.folio.update({
    where: { id: folioId },
    data: updateData,
  })

  const property = await prisma.property.findFirst({
    where: { id: folio.propertyId },
  })

  await prisma.auditLog.create({
    data: {
      organizationId: property?.organizationId || '',
      userId,
      action: 'PAYMENT',
      entity: 'FolioTransaction',
      entityId: transaction.id,
      metadata: {
        folioId,
        amount,
        type,
        newBalance: newBalanceCents / 100,
      },
    },
  })

  return { transaction, folio: updatedFolio }
}

export async function closeFolio(folioId: string): Promise<any> {
  const folio = await prisma.folio.findUnique({ where: { id: folioId } })
  if (!folio) {
    throw new NotFoundError('Folio not found')
  }

  const balanceCents = Math.round(Number(folio.balance) * 100)
  if (balanceCents !== 0) {
    throw new BadRequestError(`Folio balance is ${Number(folio.balance).toFixed(2)}. Please settle before closing.`)
  }

  const closedFolio = await prisma.folio.update({
    where: { id: folioId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
    },
  })

  const property = await prisma.property.findFirst({
    where: { id: folio.propertyId },
  })

  await prisma.auditLog.create({
    data: {
      organizationId: property?.organizationId || '',
      action: 'CHECK_OUT',
      entity: 'Folio',
      entityId: folioId,
      metadata: {
        folioNumber: folio.folioNumber,
        finalBalance: folio.balance,
      },
    },
  })

  return closedFolio
}
