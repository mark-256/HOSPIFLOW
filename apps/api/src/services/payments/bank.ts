import { PaymentProviderAdapter, PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './types'
import { BadRequestError } from '../../utils/errors'

export class BankProvider implements PaymentProviderAdapter {
  name = 'BANK' as const

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    const reference = `BANK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    return {
      id: reference,
      status: 'PENDING',
      reference,
      amount: request.amount,
      currency: 'KES',
      provider: 'BANK',
      method: 'BANK_TRANSFER',
      metadata: {
        bankReference: reference,
        description: request.description || null,
      },
      createdAt: new Date(),
    }
  }

  async verify(_paymentId: string): Promise<PaymentResponse> {
    return {
      id: _paymentId,
      status: 'PENDING',
      reference: _paymentId,
      amount: 0,
      currency: 'KES',
      provider: 'BANK',
      method: 'BANK_TRANSFER',
      metadata: {},
      createdAt: new Date(),
    }
  }

  async refund(_paymentId: string, _request: RefundRequest): Promise<RefundResponse> {
    throw new BadRequestError('Bank refunds must be processed manually through the finance module; they cannot be reversed via the payment API')
  }

  async getStatus(_paymentId: string): Promise<PaymentResponse> {
    return {
      id: _paymentId,
      status: 'PENDING',
      reference: _paymentId,
      amount: 0,
      currency: 'KES',
      provider: 'BANK',
      method: 'BANK_TRANSFER',
      metadata: {},
      createdAt: new Date(),
    }
  }

  async handleWebhook(_payload: unknown): Promise<PaymentResponse | null> {
    return null
  }
}
