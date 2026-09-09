import { PaymentProviderAdapter } from './types'
import { MpesaProvider } from './mpesa'
import { StripeProvider } from './stripe'
import { MockProvider } from './mock'
import { config } from '../../config'

export type ProviderKind = 'MPESA' | 'STRIPE' | 'MOCK'

const PROVIDER_ENV = (process.env.PAYMENT_PROVIDER || 'mock').toUpperCase() as ProviderKind
const ALLOWED_PROVIDERS: ProviderKind[] = ['MPESA', 'STRIPE', 'MOCK']

function validateEnvironment(kind: ProviderKind): void {
  if (config.nodeEnv === 'production' || config.nodeEnv === 'staging') {
    if (kind === 'MPESA') {
      const missing = [
        !config.mpesaConsumerKey && 'MPESA_CONSUMER_KEY',
        !config.mpesaConsumerSecret && 'MPESA_CONSUMER_SECRET',
        !config.mpesaPasskey && 'MPESA_PASSKEY',
        !config.mpesaShortcode && 'MPESA_SHORTCODE',
      ].filter(Boolean)

      if (missing.length > 0) {
        throw new Error(`Cannot start MPESA provider in production: missing ${missing.join(', ')}`)
      }
    }

    if (kind === 'STRIPE') {
      if (!config.stripeSecretKey) {
        throw new Error('Cannot start STRIPE provider in production: missing STRIPE_SECRET_KEY')
      }
    }

    if (kind === 'MOCK') {
      throw new Error('MOCK payment provider is not allowed in production')
    }
  }
}

export class PaymentProviderFactory {
  private static instance: PaymentProviderFactory
  private providers: Map<string, PaymentProviderAdapter> = new Map()

  private constructor() {
    this.initializeProviders()
  }

  static getInstance(): PaymentProviderFactory {
    if (!PaymentProviderFactory.instance) {
      PaymentProviderFactory.instance = new PaymentProviderFactory()
    }
    return PaymentProviderFactory.instance
  }

  private initializeProviders(): void {
    if (!ALLOWED_PROVIDERS.includes(PROVIDER_ENV)) {
      throw new Error(`Invalid PAYMENT_PROVIDER: ${PROVIDER_ENV}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`)
    }

    validateEnvironment(PROVIDER_ENV)

    switch (PROVIDER_ENV) {
      case 'MPESA':
        this.providers.set('MPESA', new MpesaProvider())
        break
      case 'STRIPE':
        this.providers.set('STRIPE', new StripeProvider())
        break
      case 'MOCK':
        this.providers.set('MOCK', new MockProvider())
        break
    }
  }

  getProvider(kind: string): PaymentProviderAdapter {
    const provider = this.providers.get(kind.toUpperCase())
    if (!provider) {
      throw new Error(`Payment provider ${kind} is not initialized`)
    }
    return provider
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }
}
