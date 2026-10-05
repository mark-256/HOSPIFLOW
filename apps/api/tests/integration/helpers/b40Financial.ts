import request from 'supertest'
import type { Express } from 'express'
import type { AuthTokens } from './auth'
import { authHeaders } from './auth'
import { getPrisma } from './app'
import { MpesaProvider } from '../../../src/services/payments/mpesa'
import { applyProviderWebhook } from '../../../src/services/paymentWebhookService'

/**
 * B40 — shared financial-integrity test helpers.
 *
 * Every helper here drives the real HTTP surface (supertest against the real
 * Express app) or the exact production provider-callback path
 * (`MpesaProvider.handleWebhook` -> `applyProviderWebhook`), which is the same
 * pair the `/api/payments/webhook/*` routes use. The test environment runs
 * `PAYMENT_PROVIDER=mock`, so the routes cannot hand out the M-Pesa adapter;
 * driving the callback through the adapter + webhook service keeps the
 * settlement logic under test identical to production while guaranteeing no
 * real money can move.
 */

export interface B40Order {
  id: string
  total: number
  balance: number
  paidAmount: number
  currency: string
}

export async function createOrder(
  app: Express,
  token: AuthTokens,
  outletId: string,
  orderType = 'DINE_IN'
): Promise<{ id: string }> {
  const res = await request(app)
    .post('/api/orders')
    .set(authHeaders(token))
    .send({ outletId, orderType })
    .expect(201)
  return { id: res.body.data.id }
}

export function addItem(
  app: Express,
  token: AuthTokens,
  orderId: string,
  productId: string,
  quantity: number | string = 1,
  extra: Record<string, unknown> = {}
) {
  return request(app)
    .post(`/api/orders/${orderId}/items`)
    .set(authHeaders(token))
    .send({ productId, quantity, ...extra })
}

export async function readOrder(prisma: any, orderId: string): Promise<B40Order> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  return {
    id: order.id,
    total: Number(order.total),
    balance: Number(order.balance),
    paidAmount: Number(order.paidAmount),
    currency: String(order.currency),
  }
}

/** An order carrying `quantity` units of the authoritative fixture product. */
export async function createOrderWithItems(
  app: Express,
  token: AuthTokens,
  outletId: string,
  productId: string,
  quantity: number | string = 1,
  itemExtras: Record<string, unknown> = {}
): Promise<B40Order> {
  const { id } = await createOrder(app, token, outletId)
  await addItem(app, token, id, productId, quantity, itemExtras).expect(201)
  return readOrder(await getPrisma(), id)
}

export function initiatePayment(
  app: Express,
  token: AuthTokens,
  body: Record<string, unknown>
) {
  return request(app).post('/api/payments/initiate').set(authHeaders(token)).send(body)
}

export function submitBankPayment(
  app: Express,
  token: AuthTokens,
  body: Record<string, unknown>
) {
  return request(app).post('/api/payments/bank/submit').set(authHeaders(token)).send(body)
}

export function verifyBankPayment(
  app: Express,
  token: AuthTokens,
  body: Record<string, unknown>
) {
  return request(app).post('/api/payments/bank/verify').set(authHeaders(token)).send(body)
}

export function rejectBankPayment(
  app: Express,
  token: AuthTokens,
  body: Record<string, unknown>
) {
  return request(app).post('/api/payments/bank/reject').set(authHeaders(token)).send(body)
}

/**
 * Stores the provider-side identifiers the initiate flow writes when the real
 * M-Pesa adapter is the configured provider. The mock adapter returns no
 * CheckoutRequestID, so a B40 test that needs a genuine settlement anchor
 * records exactly what production would have stored.
 */
export async function simulateMpesaAnchor(prisma: any, paymentId: string, anchor: string) {
  const payment = await prisma.orderPayment.findUnique({ where: { id: paymentId } })
  const metadata =
    payment?.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {}
  await prisma.orderPayment.update({
    where: { id: paymentId },
    data: { metadata: { ...metadata, checkoutRequestId: anchor } },
  })
}

export function mpesaCallback(
  checkoutRequestId: string,
  amountMinorUnits: number | string,
  options: {
    resultCode?: number
    receiptNumber?: string
    merchantRequestId?: string
    omitAmount?: boolean
    extra?: Record<string, unknown>
  } = {}
) {
  const items = [
    ...(options.omitAmount ? [] : [{ Name: 'Amount', Value: amountMinorUnits }]),
    { Name: 'PhoneNumber', Value: '254700000111' },
    { Name: 'MpesaReceiptNumber', Value: options.receiptNumber ?? 'QJG0000B40' },
  ]
  return {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutRequestId,
        MerchantRequestID: options.merchantRequestId ?? 'mr_b40',
        ResultCode: options.resultCode ?? 0,
        ResultDesc: 'Accepted',
        CallbackMetadata: { Item: items },
        ...(options.extra ?? {}),
      },
    },
  }
}

/** Delivers a callback through the production settlement path. */
export async function deliverMpesaCallback(payload: unknown, provider: string = 'MOCK') {
  const mpesa = new MpesaProvider()
  const response = await mpesa.handleWebhook(payload)
  ;(response as any).provider = provider
  return applyProviderWebhook('M-Pesa', response)
}

/** Delivers a callback built from a provider response the test assembled. */
export async function deliverProviderResponse(source: string, response: unknown) {
  return applyProviderWebhook(source, response as any)
}

export function payOrder(
  app: Express,
  token: AuthTokens,
  outletId: string,
  productId: string
): Promise<{ id: string; amount: number; status: string }> {
  return (async () => {
    const order = await createOrderWithItems(app, token, outletId, productId, 1)
    const res = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set(authHeaders(token))
      .send({ paymentMethod: 'CASH', amount: order.balance, provider: 'MOCK' })
      .expect(201)
    return res.body.data
  })()
}

export function toMinor(value: number | string): number {
  return Math.round(Number(value) * 100)
}

export async function completedPaymentTotal(prisma: any, orderId: string): Promise<number> {
  const agg = await prisma.orderPayment.aggregate({
    _sum: { amount: true },
    where: { orderId, status: 'COMPLETED' },
  })
  return Number(agg._sum.amount ?? 0)
}

export async function refundedPaymentTotal(prisma: any, paymentId: string): Promise<number> {
  const refunds = await prisma.refund.findMany({ where: { paymentId } })
  return refunds.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
}
/**
 * Stores the Stripe PaymentIntent identifier the initiate flow writes when the
 * real Stripe adapter is the configured provider.
 */
export async function simulateStripeAnchor(prisma: any, paymentId: string, paymentIntentId: string) {
  const payment = await prisma.orderPayment.findUnique({ where: { id: paymentId } })
  const metadata =
    payment?.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {}
  await prisma.orderPayment.update({
    where: { id: paymentId },
    data: {
      metadata: {
        ...metadata,
        stripePaymentIntentId: paymentIntentId,
        providerResponse: { ...(metadata.providerResponse as any), id: paymentIntentId },
      },
    },
  })
}
