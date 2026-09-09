import { Router, Request, Response } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { paymentService } from '../services/paymentService'
import { PaymentProviderFactory } from '../services/payments'
import { asyncHandler } from '../utils/asyncHandler'

import { PrismaClient } from '@hospiflow/database'

const prisma = new PrismaClient()

const router = Router()
const factory = PaymentProviderFactory.getInstance()

router.use('/initiate', authMiddleware, requirePermission('payments_process'))
router.post('/initiate', asyncHandler(paymentService.initiatePayment))

router.use('/verify', authMiddleware, requirePermission('payments_process'))
router.post('/verify', asyncHandler(paymentService.verifyPayment))

router.use('/refund', authMiddleware, requirePermission('payments_refund'))
router.post('/refund', asyncHandler(paymentService.refundPayment))

router.get('/', authMiddleware, requirePermission('payments_process'), asyncHandler(paymentService.listPayments))
router.get('/:id', authMiddleware, requirePermission('payments_process'), asyncHandler(paymentService.getPayment))
router.patch('/:id', authMiddleware, requirePermission('payments_process'), (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Payment updates not yet implemented' } })
})
router.delete('/:id', authMiddleware, requirePermission('payments_process'), (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Payment deletion not yet implemented' } })
})

router.post('/webhook/mpesa', asyncHandler(async (req: Request, res: Response) => {
  try {
    const adapter = factory.getProvider('MPESA')
    const response = await adapter.handleWebhook(req.body)

    if (!response) {
      return res.status(200).json({ success: true, message: 'Webhook received but no action taken' })
    }

    const payment = await prisma.orderPayment.findFirst({
      where: { id: response.id },
      include: { order: true },
    })

    if (!payment) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } })
    }

    const updateData: any = {
      reference: response.reference || payment.reference,
      metadata: {
        ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
        webhookProcessedAt: new Date().toISOString(),
        providerResponse: response,
      },
    }

    if (response.status === 'SUCCEEDED') {
      updateData.status = 'COMPLETED'
      updateData.paidAt = new Date()
    } else if (response.status === 'FAILED') {
      updateData.status = 'FAILED'
    } else if (response.status === 'CANCELLED') {
      updateData.status = 'CANCELLED'
    }

    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: updateData,
    })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('M-Pesa webhook error:', error)
    return res.status(400).json({ success: false, error: { code: 'WEBHOOK_ERROR', message: 'Invalid M-Pesa callback' } })
  }
}))

router.post('/webhook/stripe', asyncHandler(async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string | undefined
    const adapter = factory.getProvider('STRIPE')
    const response = await adapter.handleWebhook(req.body, signature)

    if (!response) {
      return res.status(200).json({ success: true, message: 'Webhook received but no action taken' })
    }

    const payment = await prisma.orderPayment.findFirst({
      where: { id: response.id },
      include: { order: true },
    })

    if (!payment) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment not found' } })
    }

    const updateData: any = {
      reference: response.reference || payment.reference,
      metadata: {
        ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {}),
        webhookProcessedAt: new Date().toISOString(),
        providerResponse: response,
      },
    }

    if (response.status === 'SUCCEEDED') {
      updateData.status = 'COMPLETED'
      updateData.paidAt = new Date()
    } else if (response.status === 'FAILED') {
      updateData.status = 'FAILED'
    } else if (response.status === 'CANCELLED') {
      updateData.status = 'CANCELLED'
    }

    await prisma.orderPayment.update({
      where: { id: payment.id },
      data: updateData,
    })

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Stripe webhook error:', error)
    return res.status(400).json({ success: false, error: { code: 'WEBHOOK_ERROR', message: 'Invalid Stripe webhook' } })
  }
}))

export default router
