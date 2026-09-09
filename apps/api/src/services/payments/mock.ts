import { PaymentProviderAdapter, PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './types'

export class MockProvider implements PaymentProviderAdapter {
  name = 'MOCK' as const

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    const reference = `MOCK-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    return {
      id: reference,
      status: 'SUCCEEDED',
      reference,
      amount: request.amount,
      currency: 'KES',
      provider: 'MOCK',
      method: request.method,
      metadata: { ...request.metadata, mock: true },
      createdAt: new Date(),
    }
  }

  async verify(_paymentId: string): Promise<PaymentResponse> {
    return {
      id: _paymentId,
      status: 'SUCCEEDED',
      reference: `MOCK-${_paymentId}`,
      amount: 0,
      currency: 'KES',
      provider: 'MOCK',
      method: 'OTHER',
      metadata: { mock: true },
      createdAt: new Date(),
    }
  }

  async refund(_paymentId: string, request: RefundRequest): Promise<RefundResponse> {
    const refundId = `MOCK-REFUND-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    return {
      id: refundId,
      status: 'SUCCEEDED',
      amount: request.amount,
      reason: request.reason,
      refundId,
      processedAt: new Date(),
      createdAt: new Date(),
    }
  }

  async getStatus(_paymentId: string): Promise<PaymentResponse> {
    return {
      id: _paymentId,
      status: 'SUCCEEDED',
      reference: `MOCK-${_paymentId}`,
      amount: 0,
      currency: 'KES',
      provider: 'MOCK',
      method: 'OTHER',
      metadata: { mock: true },
      createdAt: new Date(),
    }
  }

  async handleWebhook(_payload: unknown): Promise<PaymentResponse | null> {
    return null
  }
}
