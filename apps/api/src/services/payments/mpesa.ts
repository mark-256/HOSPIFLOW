import { PaymentProviderAdapter, PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './types'
import { config } from '../../config'

export class MpesaProvider implements PaymentProviderAdapter {
  name = 'MPESA' as const
  private readonly baseUrl: string
  private readonly authPath = '/oauth/v1/generate?grant_type=client_credentials'
  private readonly stkPushPath = '/mpesa/stkpush/v1/processrequest'
  private readonly stkQueryPath = '/mpesa/stkpush/v1/query'
  private readonly b2cPath = '/mpesa/b2c/v1/paymentrequest'
  private readonly c2bRefundPath = '/mpesa/reversal/v1/request'

  constructor() {
    this.baseUrl = config.mpesaEnvironment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'
  }

  private async getAuthToken(): Promise<string> {
    const auth = Buffer.from(`${config.mpesaConsumerKey}:${config.mpesaConsumerSecret}`).toString('base64')
    const response = await fetch(`${this.baseUrl}${this.authPath}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`M-Pesa auth failed: ${response.status} ${text}`)
    }

    const data = (await response.json()) as { access_token?: string }
    if (!data.access_token) {
      throw new Error('M-Pesa auth response missing access_token')
    }
    return data.access_token
  }

  async initiate(request: PaymentRequest): Promise<PaymentResponse> {
    if (!request.phoneNumber) {
      throw new Error('Phone number is required for M-Pesa STK Push')
    }

    const token = await this.getAuthToken()
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
    const password = Buffer.from(`${config.mpesaShortcode}${config.mpesaPasskey}${timestamp}`).toString('base64')

    const amountInMinor = Math.round(request.amount * 100)
    const partyA = request.phoneNumber.replace(/^\+?254/, '254').replace(/^0/, '254')

    const payload = {
      BusinessShortCode: config.mpesaShortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amountInMinor,
      PartyA: partyA,
      PartyB: config.mpesaShortcode,
      PhoneNumber: partyA,
      CallBackURL: `${config.backendUrl}/api/payments/webhook/mpesa`,
      AccountReference: request.idempotencyKey || `ORD-${request.orderId}`.slice(0, 12),
      TransactionDesc: request.description || 'HOSPIFLOW Payment',
    }

    const response = await fetch(`${this.baseUrl}${this.stkPushPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`M-Pesa STK Push failed: ${response.status} ${text}`)
    }

    const data = (await response.json()) as {
      MerchantRequestID?: string
      CheckoutRequestID?: string
      ResponseCode?: string
      ResponseDescription?: string
    }

    if (data.ResponseCode !== '0') {
      throw new Error(`M-Pesa STK Push declined: ${data.ResponseDescription || 'Unknown error'}`)
    }

    return {
      id: data.CheckoutRequestID || `mpesa-${Date.now()}`,
      status: 'PENDING',
      reference: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      amount: request.amount,
      currency: 'KES',
      provider: 'MPESA',
      method: request.method,
      metadata: { ...request.metadata, partyA, partyB: config.mpesaShortcode },
      createdAt: new Date(),
    }
  }

  async verify(paymentId: string): Promise<PaymentResponse> {
    return this.getStatus(paymentId)
  }

  async getStatus(paymentId: string): Promise<PaymentResponse> {
    const token = await this.getAuthToken()
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
    const password = Buffer.from(`${config.mpesaShortcode}${config.mpesaPasskey}${timestamp}`).toString('base64')

    const payload = {
      BusinessShortCode: config.mpesaShortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: paymentId,
    }

    const response = await fetch(`${this.baseUrl}${this.stkQueryPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`M-Pesa status query failed: ${response.status} ${text}`)
    }

    const data = (await response.json()) as {
      ResponseCode?: string
      ResponseDescription?: string
      ResultCode?: number
      ResultDesc?: string
    }

    let status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' = 'PROCESSING'
    if (data.ResultCode === 0) {
      status = 'SUCCEEDED'
    } else if (data.ResultCode !== undefined && data.ResultCode !== null) {
      status = data.ResultCode === 1032 ? 'CANCELLED' : 'FAILED'
    } else if (data.ResponseCode !== '0') {
      status = 'FAILED'
    }

    return {
      id: paymentId,
      status,
      reference: paymentId,
      amount: 0,
      currency: 'KES',
      provider: 'MPESA',
      method: 'MPESA',
      metadata: { resultDesc: data.ResultDesc, responseDescription: data.ResponseDescription },
      createdAt: new Date(),
    }
  }

  async refund(_paymentId: string, _request: RefundRequest): Promise<RefundResponse> {
    throw new Error('M-Pesa refunds require manual processing via C2B reversal. Use the Safaricom portal or implement B2C timeout handling.')
  }

  async handleWebhook(payload: unknown): Promise<PaymentResponse | null> {
    const body = payload as {
      Body?: {
        stkCallback?: {
          MerchantRequestID?: string
          CheckoutRequestID?: string
          ResultCode: number
          ResultDesc: string
          CallbackMetadata?: {
            Item: Array<{ Name: string; Value: unknown }>
          }
        }
      }
    }

    const callback = body.Body?.stkCallback
    if (!callback) {
      return null
    }

    const metadata: Record<string, unknown> = {}
    if (callback.CallbackMetadata?.Item) {
      for (const item of callback.CallbackMetadata.Item) {
        metadata[item.Name] = item.Value
      }
    }

    const amount = typeof metadata.Amount === 'number' ? metadata.Amount : undefined
    const reference = typeof metadata.MpesaReceiptNumber === 'string' ? metadata.MpesaReceiptNumber : undefined
    const phoneNumber = typeof metadata.PhoneNumber === 'number' ? String(metadata.PhoneNumber) : undefined

    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('Invalid callback amount')
    }

    const status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' =
      callback.ResultCode === 0 ? 'SUCCEEDED' : callback.ResultCode === 1032 ? 'CANCELLED' : 'FAILED'

    return {
      id: callback.CheckoutRequestID || '',
      status,
      reference: reference || callback.MerchantRequestID,
      checkoutRequestId: callback.CheckoutRequestID,
      amount: amount / 100,
      currency: 'KES',
      provider: 'MPESA',
      method: 'MPESA',
      metadata: { ...metadata, resultDesc: callback.ResultDesc, phoneNumber },
      createdAt: new Date(),
    }
  }
}
