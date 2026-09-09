import { PrismaClient, TaxRule, TaxType } from '@hospiflow/database'
import { ValidationError } from '../utils/errors'

const prisma = new PrismaClient()

export interface TaxInput {
  subtotal: number
  taxRules: TaxRule[]
  items?: Array<{ price: number; taxCategory?: string }>
  pricingMode?: 'EXCLUSIVE' | 'INCLUSIVE'
}

export interface TaxBreakdownItem {
  name: string
  type: TaxType
  rate: number
  amount: number
}

export interface TaxResult {
  subtotal: number
  taxableSubtotal: number
  taxes: TaxBreakdownItem[]
  totalTax: number
  grandTotal: number
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

function calcTaxCents(priceCents: number, rate: number, inclusive: boolean): number {
  if (inclusive) {
    if (rate <= 0) return 0
    return roundHalfUp((priceCents * rate) / (1 + rate))
  }
  return roundHalfUp(priceCents * rate)
}

export async function calculateTaxes(input: TaxInput): Promise<TaxResult> {
  const { subtotal, taxRules, items, pricingMode = 'EXCLUSIVE' } = input

  const subCents = toCents(subtotal)
  if (subCents < 0) {
    throw new ValidationError('Subtotal cannot be negative')
  }

  const activeRules = taxRules.filter(r => r.isActive)
  if (activeRules.length === 0) {
    return {
      subtotal,
      taxableSubtotal: subtotal,
      taxes: [],
      totalTax: 0,
      grandTotal: subtotal,
    }
  }

  const inclusive = pricingMode === 'INCLUSIVE'
  let taxableCents = subCents
  let totalTaxCents = 0
  const taxes: TaxBreakdownItem[] = []

  if (inclusive) {
    const sumRate = activeRules.reduce((sum, r) => sum + Number(r.rate), 0)
    if (sumRate <= 0) {
      return {
        subtotal,
        taxableSubtotal: subtotal,
        taxes: [],
        totalTax: 0,
        grandTotal: subtotal,
      }
    }

    for (const rule of activeRules) {
      const rate = Number(rule.rate)
      let ruleBaseCents = subCents

      if (rule.applicableTo.length > 0 && items && items.length > 0) {
        const applicableItems = items.filter(item => item.taxCategory && rule.applicableTo.includes(item.taxCategory))
        ruleBaseCents = applicableItems.reduce((sum, item) => sum + toCents(item.price), 0)
      }

      const taxCents = roundHalfUp((ruleBaseCents * rate) / (1 + sumRate))
      totalTaxCents += taxCents
      taxes.push({ name: rule.name, type: rule.type, rate, amount: fromCents(taxCents) })
    }

    taxableCents = subCents - totalTaxCents
    if (taxableCents < 0) {
      totalTaxCents = subCents
      taxableCents = 0
    }
  } else {
    for (const rule of activeRules) {
      const rate = Number(rule.rate)
      let ruleBaseCents = taxableCents

      if (rule.applicableTo.length > 0 && items && items.length > 0) {
        const applicableItems = items.filter(item => item.taxCategory && rule.applicableTo.includes(item.taxCategory))
        ruleBaseCents = applicableItems.reduce((sum, item) => sum + toCents(item.price), 0)
      }

      const taxCents = roundHalfUp(ruleBaseCents * rate)
      totalTaxCents += taxCents
      taxes.push({ name: rule.name, type: rule.type, rate, amount: fromCents(taxCents) })
    }
  }

  return {
    subtotal: fromCents(subCents),
    taxableSubtotal: fromCents(taxableCents),
    taxes,
    totalTax: fromCents(totalTaxCents),
    grandTotal: fromCents(taxableCents + totalTaxCents),
  }
}
