import { it, expect } from 'vitest'
import { calculateDiscount } from '../../src/services/discountEngine'

it('applies percentage discount', () => {
  const result = calculateDiscount(1000, { type: 'PERCENTAGE', value: 10 }, 'cashier', ['orders_discount'])
  expect(result.originalAmount).toBeCloseTo(1000, 2)
  expect(result.discountAmount).toBeCloseTo(100, 2)
  expect(result.finalAmount).toBeCloseTo(900, 2)
})

it('applies fixed discount', () => {
  const result = calculateDiscount(1000, { type: 'FIXED', value: 150 }, 'cashier', ['orders_discount'])
  expect(result.discountAmount).toBeCloseTo(150, 2)
  expect(result.finalAmount).toBeCloseTo(850, 2)
})

it('rejects discount greater than subtotal', () => {
  expect(() => calculateDiscount(100, { type: 'FIXED', value: 150 }, 'cashier', ['orders_discount'])).toThrow()
})

it('rejects 100%+ percentage discount', () => {
  expect(() => calculateDiscount(1000, { type: 'PERCENTAGE', value: 100 }, 'cashier', ['orders_discount'])).toThrow()
})

it('rejects sensitive discount without permission', () => {
  expect(() => calculateDiscount(1000, { type: 'PERCENTAGE', value: 10, reason: 'Manager override' }, 'cashier', [])).toThrow()
})

it('handles zero discount', () => {
  const result = calculateDiscount(1000, { type: 'PERCENTAGE', value: 0 }, 'cashier', ['orders_discount'])
  expect(result.discountAmount).toBeCloseTo(0, 2)
  expect(result.finalAmount).toBeCloseTo(1000, 2)
})

it('prevents negative total', () => {
  expect(() => calculateDiscount(100, { type: 'FIXED', value: 200 }, 'cashier', ['orders_discount'])).toThrow()
})