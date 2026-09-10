import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { getApp, setupTestDatabase, getSeedData, getPrisma, disconnect } from './helpers/app'
import { login, authHeaders, AuthTokens } from './helpers/auth'
import { calculateTaxes } from '../../src/services/taxEngine'
import { calculateDiscount, DiscountInput } from '../../src/services/discountEngine'
import { Prisma } from '@hospiflow/database'
import { Express } from 'express'

let app: Express
let seedData: any
let adminTokens: AuthTokens
let cashierTokens: AuthTokens

beforeAll(async () => {
  app = await getApp()
  seedData = await setupTestDatabase()
  adminTokens = await login(app, seedData.orgA.users.ORG_ADMIN.email, seedData.orgA.users.ORG_ADMIN.password)
  cashierTokens = await login(app, seedData.orgA.users.CASHIER.email, seedData.orgA.users.CASHIER.password)
}, 60000)

afterAll(async () => {
  await disconnect()
})

describe('Tax Integration Tests', () => {
  it('calculateTaxes with no rules returns subtotal as grand total', async () => {
    const result = await calculateTaxes({
      subtotal: 100.0,
      taxRules: [],
    })
    expect(result.subtotal).toBe(100.0)
    expect(result.totalTax).toBe(0)
    expect(result.grandTotal).toBe(100.0)
    expect(result.taxes.length).toBe(0)
  })

  it('calculateTaxes with VAT 16% (exclusive)', async () => {
    const result = await calculateTaxes({
      subtotal: 100.0,
      taxRules: [{ id: '1', organizationId: seedData.orgA.organizationId, name: 'VAT', type: 'VAT', rate: new Prisma.Decimal('0.16'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() }],
    })
    expect(result.subtotal).toBe(100.0)
    expect(result.taxableSubtotal).toBe(100.0)
    expect(result.totalTax).toBe(16.0)
    expect(result.grandTotal).toBe(116.0)
    expect(result.taxes[0].name).toBe('VAT')
    expect(result.taxes[0].type).toBe('VAT')
    expect(result.taxes[0].rate).toBe(0.16)
    expect(result.taxes[0].amount).toBe(16.0)
  })

  it('calculateTaxes with VAT inclusive', async () => {
    const result = await calculateTaxes({
      subtotal: 116.0,
      taxRules: [{ id: '1', organizationId: seedData.orgA.organizationId, name: 'VAT', type: 'VAT', rate: new Prisma.Decimal('0.16'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() }],
      pricingMode: 'INCLUSIVE',
    })
    expect(result.subtotal).toBe(116.0)
    expect(result.totalTax).toBeCloseTo(16.0, 2)
    expect(result.grandTotal).toBe(116.0)
  })

  it('calculateTaxes with zero-tax rate', async () => {
    const result = await calculateTaxes({
      subtotal: 100.0,
      taxRules: [{ id: '1', organizationId: seedData.orgA.organizationId, name: 'Zero', type: 'VAT', rate: new Prisma.Decimal('0'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() }],
    })
    expect(result.totalTax).toBe(0)
    expect(result.grandTotal).toBe(100.0)
  })

  it('calculateTaxes with multiple tax rules', async () => {
    const result = await calculateTaxes({
      subtotal: 100.0,
      taxRules: [
        { id: '1', organizationId: seedData.orgA.organizationId, name: 'VAT', type: 'VAT', rate: new Prisma.Decimal('0.16'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() },
        { id: '2', organizationId: seedData.orgA.organizationId, name: 'Service', type: 'SERVICE_CHARGE', rate: new Prisma.Decimal('0.10'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() },
      ],
    })
    expect(result.totalTax).toBeCloseTo(26.0, 2)
    expect(result.grandTotal).toBeCloseTo(126.0, 2)
  })

  it('calculateTaxes rejects negative subtotal', async () => {
    await expect(calculateTaxes({ subtotal: -100.0, taxRules: [] })).rejects.toThrow('Subtotal cannot be negative')
  })

  it('calculateTaxes with rounding precision', async () => {
    const result = await calculateTaxes({
      subtotal: 99.99,
      taxRules: [{ id: '1', organizationId: seedData.orgA.organizationId, name: 'VAT', type: 'VAT', rate: new Prisma.Decimal('0.16'), isActive: true, applicableTo: [], createdAt: new Date(), updatedAt: new Date() }],
    })
    expect(result.totalTax).toBeCloseTo(16.0, 1)
    expect(result.grandTotal).toBeCloseTo(115.99, 2)
  })

  it('Tax engine through POS order flow', async () => {
    const headers = authHeaders(cashierTokens)
    const orderRes = await request(app)
      .post('/api/orders')
      .set(headers)
      .send({ outletId: seedData.orgA.outletId, orderType: 'DINE_IN' })
      .expect(201)

    const order = orderRes.body.data
    const productId = seedData.orgA.productId

    const itemRes = await request(app)
      .post(`/api/orders/${order.id}/items`)
      .set(headers)
      .send({ productId, quantity: 2 })
      .expect(201)

    const response = await request(app)
      .get(`/api/orders/${order.id}`)
      .set(headers)
      .expect(200)

    const fetchedOrder = response.body.data
    expect(Number(fetchedOrder.subtotal)).toBe(25)
    expect(Number(fetchedOrder.total)).toBe(25)
    expect(Number(fetchedOrder.balance)).toBe(25)
  })
})

describe('Discount Integration Tests', () => {
  const permissions = ['orders_create', 'orders_view', 'orders_edit', 'orders_discount', 'payments_process', 'payments_refund']

  it('percentage discount calculated correctly', () => {
    const input: DiscountInput = {
      type: 'PERCENTAGE',
      value: 10,
    }
    const result = calculateDiscount(100.0, input, 'CASHIER', permissions)
    expect(result.originalAmount).toBe(100.0)
    expect(result.discountAmount).toBe(10.0)
    expect(result.finalAmount).toBe(90.0)
  })

  it('fixed discount calculated correctly', () => {
    const input: DiscountInput = {
      type: 'FIXED',
      value: 15.00,
    }
    const result = calculateDiscount(100.0, input, 'CASHIER', permissions)
    expect(result.discountAmount).toBe(15.0)
    expect(result.finalAmount).toBe(85.0)
  })

  it('fixed discount capped at eligible amount', () => {
    const input: DiscountInput = {
      type: 'FIXED',
      value: 150.00,
    }
    const result = calculateDiscount(100.0, input, 'CASHIER', permissions)
    expect(result.discountAmount).toBe(100.0)
    expect(result.finalAmount).toBe(0)
  })

  it('percentage discount > 100% rejected', () => {
    const input: DiscountInput = { type: 'PERCENTAGE', value: 150 }
    expect(() => calculateDiscount(100.0, input, 'CASHIER', permissions)).toThrow('Discount percentage cannot exceed 100%')
  })

  it('discount equals subtotal capped to zero', () => {
    const input: DiscountInput = { type: 'FIXED', value: 100.0 }
    const result = calculateDiscount(100.0, input, 'CASHIER', permissions)
    expect(result.discountAmount).toBe(100.0)
    expect(result.finalAmount).toBe(0)
  })

  it('unauthorized discount with reason rejected', () => {
    const input: DiscountInput = { type: 'PERCENTAGE', value: 10, reason: 'VIP override' }
    expect(() => calculateDiscount(100.0, input, 'WAITER', [])).toThrow('Insufficient permissions to apply sensitive discount')
  })

  it('authorized discount with reason succeeds', () => {
    const input: DiscountInput = { type: 'PERCENTAGE', value: 10, reason: 'VIP override' }
    const result = calculateDiscount(100.0, input, 'CASHIER', ['orders_discount'])
    expect(result.discountAmount).toBe(10.0)
    expect(result.finalAmount).toBe(90.0)
  })

  it('discount prevents negative final amount', () => {
    const input: DiscountInput = { type: 'FIXED', value: 50.0 }
    const result = calculateDiscount(40.0, input, 'CASHIER', permissions)
    expect(result.finalAmount).toBe(0)
    expect(result.discountAmount).toBe(40.0)
  })

  it('zero subtotal discount rejected', () => {
    const input: DiscountInput = { type: 'PERCENTAGE', value: 10 }
    expect(() => calculateDiscount(0, input, 'CASHIER', permissions)).toThrow('Cannot apply discount to zero or negative subtotal')
  })
})
