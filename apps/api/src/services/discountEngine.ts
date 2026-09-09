import { PrismaClient } from '@hospiflow/database'
import { BadRequestError, ForbiddenError, ValidationError } from '../utils/errors'

const prisma = new PrismaClient()

export interface DiscountInput {
  type: 'PERCENTAGE' | 'FIXED'
  value: number
  scope?: 'ORDER' | 'ITEM'
  items?: Array<{ price: number; quantity: number }>
  ruleId?: string
  reason?: string
}

export interface DiscountRule {
  id: string
  name: string
  type: string
  value: number
  isActive: boolean
}

export interface AppliedDiscountRule {
  ruleId?: string
  ruleName: string
  type: string
  value: number
  amount: number
  scope: string
}

export interface DiscountResult {
  originalAmount: number
  discountAmount: number
  finalAmount: number
  appliedRules: AppliedDiscountRule[]
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

function roundHalfUp(value: number): number {
  return Math.round(value)
}

export function calculateDiscount(
  subtotal: number,
  discountInput: DiscountInput,
  _userRole: string,
  permissions: string[]
): DiscountResult {
  const subCents = toCents(subtotal)

  if (subCents <= 0) {
    throw new ValidationError('Cannot apply discount to zero or negative subtotal')
  }

  const isSensitive = discountInput.reason && discountInput.reason.trim().length > 0
  if (isSensitive && !permissions.includes('orders_discount')) {
    throw new ForbiddenError('Insufficient permissions to apply sensitive discount')
  }

  const valueCents = toCents(discountInput.value)
  if (valueCents < 0) {
    throw new ValidationError('Discount value cannot be negative')
  }

  let discountCents = 0
  const scope = discountInput.scope || 'ORDER'

  if (discountInput.type === 'PERCENTAGE') {
    const percentCents = toCents(discountInput.value)
    if (percentCents >= 10000) {
      throw new ValidationError('Discount percentage cannot exceed 100%')
    }

    if (scope === 'ITEM' && discountInput.items && discountInput.items.length > 0) {
      const itemsTotalCents = discountInput.items.reduce(
        (sum, item) => sum + toCents(item.price * item.quantity),
        0
      )
      discountCents = roundHalfUp((itemsTotalCents * percentCents) / 10000)
    } else {
      discountCents = roundHalfUp((subCents * percentCents) / 10000)
    }
  } else if (discountInput.type === 'FIXED') {
    if (scope === 'ITEM' && discountInput.items && discountInput.items.length > 0) {
      const itemsTotalCents = discountInput.items.reduce(
        (sum, item) => sum + toCents(item.price * item.quantity),
        0
      )
      discountCents = Math.min(valueCents, itemsTotalCents)
    } else {
      discountCents = Math.min(valueCents, subCents)
    }
  } else {
    throw new ValidationError(`Unsupported discount type: ${String(discountInput.type)}`)
  }

  if (discountCents > subCents) {
    throw new ValidationError('Discount amount cannot exceed subtotal')
  }

  const finalCents = subCents - discountCents
  const appliedRule: AppliedDiscountRule = {
    ruleId: discountInput.ruleId,
    ruleName: discountInput.ruleId ? `Rule ${discountInput.ruleId}` : 'Manual Discount',
    type: discountInput.type,
    value: discountInput.value,
    amount: fromCents(discountCents),
    scope,
  }

  return {
    originalAmount: subtotal,
    discountAmount: fromCents(discountCents),
    finalAmount: fromCents(finalCents),
    appliedRules: [appliedRule],
  }
}

export async function validateDiscountRule(discountInput: DiscountInput): Promise<DiscountRule | null> {
  if (!discountInput.ruleId) return null

  const rule = await prisma.discount.findUnique({
    where: { id: discountInput.ruleId },
  })

  if (!rule || !rule.isActive) {
    throw new BadRequestError('Discount rule not found or inactive')
  }

  const now = new Date()
  if (rule.startDate && rule.startDate > now) {
    throw new BadRequestError('Discount rule has not started yet')
  }
  if (rule.endDate && rule.endDate < now) {
    throw new BadRequestError('Discount rule has expired')
  }

  return {
    id: rule.id,
    name: rule.name,
    type: rule.type,
    value: Number(rule.value),
    isActive: rule.isActive,
  }
}
