import type { PaymentStatus as PrismaPaymentStatus } from '@hospiflow/database'

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'

export type PaymentProvider =
  | 'MPESA'
  | 'STRIPE'
  | 'CARD'
  | 'BANK'
  | 'MOCK'

export type PaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'MPESA'
  | 'BANK_TRANSFER'
  | 'ROOM_CHARGE'
  | 'STRIPE'
  | 'OTHER'

export function toPrismaStatus(status: PaymentStatus): PrismaPaymentStatus {
  const map: Record<PaymentStatus, PrismaPaymentStatus> = {
    PENDING: 'PENDING',
    PROCESSING: 'PENDING',
    SUCCEEDED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
    PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  }
  return map[status]
}

export interface PaymentRequest {
  orderId: string
  amount: number
  method: PaymentMethod
  provider: PaymentProvider
  phoneNumber?: string
  email?: string
  description?: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface PaymentResponse {
  id: string
  status: PaymentStatus
  reference?: string
  checkoutRequestId?: string
  clientSecret?: string
  amount: number
  currency: string
  provider: PaymentProvider
  method: PaymentMethod
  metadata?: Record<string, unknown>
  createdAt: Date
}

export interface RefundRequest {
  amount: number
  reason: string
}

export interface RefundResponse {
  id: string
  status: string
  amount: number
  reason: string
  refundId?: string
  processedAt?: Date
  createdAt: Date
}

export interface PaymentProviderAdapter {
  initiate(request: PaymentRequest): Promise<PaymentResponse>
  verify(paymentId: string): Promise<PaymentResponse>
  refund(paymentId: string, request: RefundRequest): Promise<RefundResponse>
  getStatus(paymentId: string): Promise<PaymentResponse>
  handleWebhook(payload: unknown, signature?: string): Promise<PaymentResponse | null>
  name: PaymentProvider
}
