import { Request, Response } from 'express'
import { PrismaClient, PaymentStatus as PrismaPaymentStatus, PaymentProvider, PaymentMethod } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { PaymentProviderFactory } from './payments'
import { PaymentRequest, PaymentResponse, RefundRequest, RefundResponse } from './payments/types'
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors'

const prisma = new PrismaClient()

const factory = PaymentProviderFactory.getInstance()

function toMinorUnits(amount: number | string): number {
  const num = typeof amount === 'number' ? amount : parseFloat(amount)
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Invalid monetary value')
  }
  return Math.round(num * 100)
}

function fromMinorUnits(minor: number): number {
  return minor / 100
}

function validateAmount(amount: unknown): number {
  if (typeof amount !== 'number' && typeof amount !== 'string') {
    throw new Error('Amount must be a number or string')
  }
  const num = typeof amount === 'number' ? amount : parseFloat(amount)
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error('Amount must be a positive number')
  }
  return num
}

function assertSameOrganization(orderId: string, organizationId: string): Promise<{ organizationId: string; outletId: string }> {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      outlet: {
        property: {
          organizationId,
        },
      },
    },
    include: {
      outlet: {
        include: {
          property: true,
        },
      },
    },
  }).then((order) => {
    if (!order) {
      throw new NotFoundError('Order not found or does not belong to your organization')
    }
    return {
      organizationId: order.outlet.property.organizationId,
      outletId: order.outletId,
    }
  })
}

export const paymentService = {
  initiatePayment: async (req: AuthenticatedRequest, res: Response) => {
    const { orderId, amount, method, provider, phoneNumber, email, description, metadata, idempotencyKey } = req.body as PaymentRequest

    if (!orderId || !amount || !method || !provider) {
      throw new BadRequestError('orderId, amount, method, and provider are required')
    }

    const amountDecimal = validateAmount(amount)

    const ctx = await assertSameOrganization(orderId, req.user!.organizationId)

    if (idempotencyKey) {
      const existing = await prisma.orderPayment.findFirst({
        where: {
          orderId,
          metadata: {
            path: ['idempotencyKey'],
            equals: idempotencyKey,
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (existing) {
        const adapter = factory.getProvider(provider)
        const response = await adapter.getStatus(existing.id)
        return res.json({ success: true, data: response, idempotent: true })
      }
    }

    const payment = await prisma.orderPayment.create({
      data: {
        orderId,
        paymentMethod: method as PaymentMethod,
        amount: amountDecimal.toFixed(2),
        status: 'PENDING',
        provider: provider as PaymentProvider,
        metadata: {
          idempotencyKey: idempotencyKey || null,
          phoneNumber: phoneNumber || null,
          email: email || null,
          description: description || null,
          ...metadata,
        },
      },
    })

    const adapter = factory.getProvider(provider)

    const providerRequest: PaymentRequest = {
      orderId,
      amount: amount,
      method,
      provider: provider as PaymentRequest['provider'],
      phoneNumber,
      email,
      description,
      metadata: {
        ...metadata,
        idempotencyKey: idempotencyKey || undefined,
      },
      idempotencyKey,
    }

    const response = await adapter.initiate(providerRequest)

    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: {
        reference: response.reference || payment.reference,
        metadata: {
          ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
          checkoutRequestId: response.checkoutRequestId || undefined,
          clientSecret: response.clientSecret || undefined,
          providerResponse: JSON.parse(JSON.stringify(response)),
        },
      },
    })

    return res.status(201).json({ success: true, data: response })
  },

  verifyPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId } = req.params

    if (!paymentId) {
      throw new BadRequestError('paymentId is required')
    }

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: paymentId,
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: {
          include: {
            outlet: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    })

    if (!payment) {
      throw new NotFoundError('Payment not found')
    }

    const provider = payment.provider || 'MOCK'
    const adapter = factory.getProvider(provider)

    const response = await adapter.verify(payment.id)

    if (response.status === 'SUCCEEDED') {
      await prisma.orderPayment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          reference: response.reference || payment.reference,
          metadata: {
            ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
            verifiedAt: new Date().toISOString(),
            providerResponse: JSON.parse(JSON.stringify(response)),
          },
        },
      })
    } else if (response.status === 'FAILED') {
      await prisma.orderPayment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          reference: response.reference || payment.reference,
          metadata: {
            ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
            verifiedAt: new Date().toISOString(),
            providerResponse: JSON.parse(JSON.stringify(response)),
          },
        },
      })
    }

    return res.json({ success: true, data: response })
  },

  refundPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId } = req.params
    const { amount, reason } = req.body as RefundRequest

    if (!paymentId || !amount) {
      throw new BadRequestError('paymentId and amount are required')
    }

    const refundAmount = toMinorUnits(amount)

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id: paymentId,
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: true,
      },
    })

    if (!payment) {
      throw new NotFoundError('Payment not found')
    }

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestError('Only completed payments can be refunded')
    }

    const paymentAmount = toMinorUnits(Number(payment.amount))
    const existingRefunds = await prisma.refund.findMany({
      where: { paymentId: payment.id },
    })

    const totalRefunded = existingRefunds.reduce((sum, r) => sum + toMinorUnits(Number(r.amount)), 0)
    const remainingRefundable = paymentAmount - totalRefunded

    if (refundAmount > remainingRefundable) {
      throw new BadRequestError(`Refund amount exceeds remaining refundable amount: ${fromMinorUnits(remainingRefundable).toFixed(2)}`)
    }

    const provider = payment.provider || 'MOCK'
    const adapter = factory.getProvider(provider)

    const refundRequest: RefundRequest = {
      amount: fromMinorUnits(refundAmount),
      reason: reason || 'Refund requested',
    }

    const refundResponse = await adapter.refund(payment.id, refundRequest)

    const isFullRefund = refundAmount === remainingRefundable
    const isPartialRefund = !isFullRefund

    const refund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: fromMinorUnits(refundAmount),
        reason: refundRequest.reason,
        status: refundResponse.status === 'SUCCEEDED' || refundResponse.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
        approvedBy: req.user!.id,
        processedAt: refundResponse.processedAt || new Date(),
      },
    })

    const newPaymentStatus: PrismaPaymentStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: {
        status: newPaymentStatus,
      },
    })

    if (isFullRefund || isPartialRefund) {
      const folio = await prisma.folio.findFirst({
        where: {
          reservationId: payment.order.id,
          property: {
            organizationId: req.user!.organizationId,
          },
        },
      })

      if (folio) {
        await prisma.folioTransaction.create({
          data: {
            folioId: folio.id,
            type: 'REFUND',
            category: 'PAYMENT',
            description: `Refund for payment ${payment.id}: ${reason}`,
            amount: fromMinorUnits(refundAmount),
            reference: refund.id,
            sourceId: payment.id,
            sourceType: 'OrderPayment',
            createdBy: req.user!.id,
          },
        })

        await prisma.folio.update({
          where: { id: folio.id },
          data: {
            totalRefunds: { increment: fromMinorUnits(refundAmount) },
            balance: { increment: fromMinorUnits(refundAmount) },
          },
        })
      }
    }

    return res.status(201).json({ success: true, data: { ...refundResponse, id: refund.id } })
  },

  getPayment: async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params

    const payment = await prisma.orderPayment.findFirst({
      where: {
        id,
        order: {
          outlet: {
            property: {
              organizationId: req.user!.organizationId,
            },
          },
        },
      },
      include: {
        order: {
          include: {
            outlet: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    })

    if (!payment) {
      throw new NotFoundError('Payment not found')
    }

    return res.json({ success: true, data: payment })
  },

  listPayments: async (req: AuthenticatedRequest, res: Response) => {
    const { status, provider, from, to, page = '1', limit = '20' } = req.query as Record<string, string>

    const where: any = {
      order: {
        outlet: {
          property: {
            organizationId: req.user!.organizationId,
          },
        },
      },
    }

    if (status) where.status = status as PrismaPaymentStatus
    if (provider) where.provider = provider as PaymentProvider
    if (from) where.createdAt = { ...where.createdAt, gte: new Date(from) }
    if (to) where.createdAt = { ...where.createdAt, lte: new Date(to) }

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    const skip = (pageNum - 1) * limitNum

    const [payments, total] = await Promise.all([
      prisma.orderPayment.findMany({
        where,
        include: {
          order: {
            include: {
              outlet: {
                include: {
                  property: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.orderPayment.count({ where }),
    ])

    return res.json({
      success: true,
      data: payments,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  },
}
