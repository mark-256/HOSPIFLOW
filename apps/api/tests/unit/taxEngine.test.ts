import { it, expect } from 'vitest'
import { calculateTaxes } from '../../src/services/taxEngine'
import type { TaxRule } from '@hospiflow/database'

const orgId = 'org-1'

function makeRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: 'tax-1',
    organizationId: orgId,
    name: 'VAT',
    type: 'VAT',
    rate: 0.16 as any,
    isActive: true,
    applicableTo: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaxRule
}

it('calculates tax-exclusive correctly', async () => {
  const rules = [makeRule()]
  const result = await calculateTaxes({ subtotal: 1000, taxRules: rules })
  expect(result.taxableSubtotal).toBeCloseTo(1000, 2)
  expect(result.taxes[0].amount).toBeCloseTo(160, 2)
  expect(result.grandTotal).toBeCloseTo(1160, 2)
})

it('handles zero subtotal', async () => {
  const rules = [makeRule()]
  const result = await calculateTaxes({ subtotal: 0, taxRules: rules })
  expect(result.taxes[0].amount).toBeCloseTo(0, 2)
  expect(result.grandTotal).toBeCloseTo(0, 2)
})

it('handles multiple taxes', async () => {
  const rules = [
    makeRule({ id: 't1', name: 'VAT', type: 'VAT', rate: 0.16 as any }),
    makeRule({ id: 't2', name: 'Service', type: 'SERVICE_CHARGE', rate: 0.1 as any }),
  ]
  const result = await calculateTaxes({ subtotal: 1000, taxRules: rules })
  expect(result.taxes).toHaveLength(2)
  expect(result.totalTax).toBeCloseTo(260, 2)
  expect(result.grandTotal).toBeCloseTo(1260, 2)
})

it('handles zero tax rate', async () => {
  const rules = [makeRule({ rate: 0 as any })]
  const result = await calculateTaxes({ subtotal: 1000, taxRules: rules })
  expect(result.taxes[0].amount).toBeCloseTo(0, 2)
  expect(result.grandTotal).toBeCloseTo(1000, 2)
})

it('skips inactive tax rules', async () => {
  const rules = [makeRule({ isActive: false })]
  const result = await calculateTaxes({ subtotal: 1000, taxRules: rules })
  expect(result.taxes).toHaveLength(0)
  expect(result.grandTotal).toBeCloseTo(1000, 2)
})

it('rounds correctly', async () => {
  const rules = [makeRule({ rate: 0.175 as any })]
  const result = await calculateTaxes({ subtotal: 999.99, taxRules: rules })
  expect(result.taxes[0].amount).toBeCloseTo(175, 0)
  expect(result.grandTotal).toBeCloseTo(1174.99, 2)
})
