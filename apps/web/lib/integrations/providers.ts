export interface PaymentProvider {
  name: string
  initiate(amount: number, phone?: string): Promise<{ success: boolean; reference?: string }>
  verify(reference: string): Promise<{ success: boolean; status: string }>
}

export class MockPaymentProvider implements PaymentProvider {
  name = 'mock'
  async initiate(amount: number) {
    return { success: true, reference: `MOCK-${Date.now()}` }
  }
  async verify(reference: string) {
    return { success: true, status: 'COMPLETED' }
  }
}

export class MpesaProvider implements PaymentProvider {
  name = 'mpesa'
  async initiate(amount: number, phone?: string) {
    if (!phone) throw new Error('Phone number required')
    return { success: true, reference: `MPESA-${Date.now()}` }
  }
  async verify(reference: string) {
    return { success: true, status: 'COMPLETED' }
  }
}

export class StripeProvider implements PaymentProvider {
  name = 'stripe'
  async initiate(amount: number) {
    return { success: true, reference: `ST-${Date.now()}` }
  }
  async verify(reference: string) {
    return { success: true, status: 'COMPLETED' }
  }
}

export function getPaymentProvider(type: string): PaymentProvider {
  switch (type) {
    case 'MPESA':
      return new MpesaProvider()
    case 'STRIPE':
      return new StripeProvider()
    default:
      return new MockPaymentProvider()
  }
}
