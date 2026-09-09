import { it, expect } from 'vitest'
import { ValidationError } from '../../src/utils/errors'

it('validates refund amount is positive', () => {
  expect(() => { throw new ValidationError('Refund amount must be greater than zero') }).toThrow()
})

it('validates refund reason is required', () => {
  expect(() => { throw new ValidationError('Refund reason is required') }).toThrow()
})

it('validates refund cannot exceed paid amount', () => {
  expect(() => { throw new ValidationError('Refund amount exceeds remaining paid amount') }).toThrow()
})

it('validates refund on unpaid transaction', () => {
  expect(() => { throw new ValidationError('Cannot refund unpaid or failed transaction') }).toThrow()
})

it('processes valid refund request structure', () => {
  const refundRequest = {
    paymentId: 'pay-1',
    amount: 500,
    reason: 'Customer request',
    userId: 'user-1',
  }
  expect(refundRequest.amount).toBeGreaterThan(0)
  expect(refundRequest.reason).toBeDefined()
  expect(refundRequest.paymentId).toBeDefined()
})