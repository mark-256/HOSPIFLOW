import { PaymentProviderAdapter, PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './types'
import { config } from '../../config'
import crypto from 'crypto'

export class StripeProvider implements PaymentProviderAdapter {
  name = 'STRIPE' as const
  private readonly apiBase = 'https://api.stripe.com/v1'
  private readonly secretKey: string

  constructor() {
    if (!config.stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is required for StripeProvider')
    }
    this.secretKey = config.stripeSecretKey
  }

  private async request(path: string, method: string, body?: Record<string, unknown>): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
    }

    let url = `${this.apiBase}${path}`
    let fetchBody: string | undefined

    if (method === 'GET' && body) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      }
      url = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`
    } else if (method !== 'GET' && method !== 'DELETE' && body) {
      fetchBody = new URLSearchParams(body as Record<string, string>).toString()
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }

    const response = await fetch(url, {
      method,
      headers,
      body: fetchBody,
    })

    if (!response.ok) {
      const text = await response.text()
      let errorDetail = text
      try {
        const errorJson = JSON.parse(text)
        errorDetail = errorJson.error?.message || text
      } catch {
        // keep text as is
      }
      throw new Error(`Stripe API error ${response.status}: ${errorDetail}`)
    }

    if (response.status === 204) {
      return null
    }

    return (await response.json()) as unknown
  }

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    const amountInMinor = Math.round(request.amount * 100)

    const payload: Record<string, string> = {
      amount: String(amountInMinor),
      currency: 'kes',
      payment_method_types: 'mpesa_stk',
      description: request.description || 'HOSPIFLOW Payment',
      metadata: JSON.stringify({
        orderId: request.orderId,
        hospiflowProvider: 'stripe',
        ...request.metadata,
      }),
    }

    if (request.idempotencyKey) {
      payload['idempotency_key'] = request.idempotencyKey
    }

    if (request.email) {
      payload.receipt_email = request.email
    }

    const data = (await this.request('/payment_intents', 'POST', payload)) as {
      id: string
      client_secret: string
      status: string
      amount: number
      currency: string
    }

    return {
      id: data.id,
      status: this.mapStatus(data.status),
      clientSecret: data.client_secret,
      amount: data.amount / 100,
      currency: data.currency.toUpperCase(),
      provider: 'STRIPE',
      method: request.method,
      metadata: { stripePaymentIntentId: data.id, ...request.metadata },
      createdAt: new Date(),
    }
  }

  async verify(paymentId: string): Promise<PaymentResponse> {
    return this.getStatus(paymentId)
  }

  async getStatus(paymentId: string): Promise<PaymentResponse> {
    const data = (await this.request(`/payment_intents/${encodeURIComponent(paymentId)}`, 'GET')) as {
      id: string
      status: string
      amount: number
      currency: string
      metadata?: Record<string, string>
    }

    return {
      id: data.id,
      status: this.mapStatus(data.status),
      amount: data.amount / 100,
      currency: data.currency.toUpperCase(),
      provider: 'STRIPE',
      method: 'CARD',
      metadata: data.metadata,
      createdAt: new Date(),
    }
  }

  async refund(paymentId: string, request: RefundRequest): Promise<RefundResponse> {
    const amountInMinor = Math.round(request.amount * 100)
    const data = (await this.request(`/payment_intents/${encodeURIComponent(paymentId)}/refunds`, 'POST', {
      amount: String(amountInMinor),
      reason: request.reason || 'requested_by_customer',
      metadata: JSON.stringify({ reason: request.reason }),
    })) as {
      id: string
      status: string
      amount: number
      created: number
    }

    return {
      id: data.id,
      status: data.status,
      amount: data.amount / 100,
      reason: request.reason,
      refundId: data.id,
      processedAt: new Date(data.created * 1000),
      createdAt: new Date(data.created * 1000),
    }
  }

  async handleWebhook(payload: unknown, signature?: string): Promise<PaymentResponse | null> {
    if (!signature || !config.stripeWebhookSecret) {
      throw new Error('Stripe webhook signature and STRIPE_WEBHOOK_SECRET are required')
    }

    const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const expectedSignature = this.computeSignature(rawPayload, config.stripeWebhookSecret)

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      throw new Error('Invalid Stripe webhook signature')
    }

    const event = JSON.parse(rawPayload) as {
      type: string
      data: { object: Record<string, unknown> }
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as {
        id: string
        status: string
        amount: number
        currency: string
        metadata?: Record<string, string>
      }
      return {
        id: pi.id,
        status: this.mapStatus(pi.status),
        amount: pi.amount / 100,
        currency: pi.currency.toUpperCase(),
        provider: 'STRIPE',
        method: 'CARD',
        metadata: pi.metadata,
        createdAt: new Date(),
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as {
        id: string
        status: string
        amount: number
        currency: string
      }
      return {
        id: pi.id,
        status: 'FAILED',
        amount: pi.amount / 100,
        currency: pi.currency.toUpperCase(),
        provider: 'STRIPE',
        method: 'CARD',
        createdAt: new Date(),
      }
    }

    return null
  }

  private mapStatus(stripeStatus: string): 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' {
    const statusMap: Record<string, 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'> = {
      requires_payment_method: 'PENDING',
      requires_confirmation: 'PENDING',
      requires_action: 'PROCESSING',
      processing: 'PROCESSING',
      requires_capture: 'PROCESSING',
      succeeded: 'SUCCEEDED',
      canceled: 'CANCELLED',
      failed: 'FAILED',
    }
    return statusMap[stripeStatus] || 'PENDING'
  }

  private computeSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  }
}
