import { it, expect } from 'vitest'
import { MockProvider } from '../../src/services/payments/mock'

it('mock provider returns deterministic test response', async () => {
  const provider = new MockProvider()
  const result = await provider.initiate({
    orderId: 'order-1',
    amount: 1000,
    method: 'MPESA',
    provider: 'MOCK',
  })
  expect(result.status).toBe('SUCCEEDED')
  expect(result.reference).toBeDefined()
})

it('mock provider verify returns SUCCEEDED', async () => {
  const provider = new MockProvider()
  const result = await provider.verify('pay-123')
  expect(result.status).toBe('SUCCEEDED')
})

it('mock provider refund returns SUCCEEDED', async () => {
  const provider = new MockProvider()
  const result = await provider.refund('pay-123', { amount: 500, reason: 'Test' })
  expect(result.status).toBe('SUCCEEDED')
  expect(result.amount).toBe(500)
})

it('mock provider getStatus returns SUCCEEDED', async () => {
  const provider = new MockProvider()
  const result = await provider.getStatus('pay-123')
  expect(result.status).toBe('SUCCEEDED')
})

it('mock provider handleWebhook returns null', async () => {
  const provider = new MockProvider()
  const result = await provider.handleWebhook({})
  expect(result).toBeNull()
})