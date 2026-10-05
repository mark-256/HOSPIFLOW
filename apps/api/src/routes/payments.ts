import { Router, Request, Response } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { paymentService } from '../services/paymentService'
import { PaymentProviderFactory } from '../services/payments'
import { applyProviderWebhook, verifyWebhookSecret, webhookErrorResponse } from '../services/paymentWebhookService'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
const factory = PaymentProviderFactory.getInstance()

router.use('/initiate', authMiddleware, requirePermission('payments_process'))
router.post('/initiate', asyncHandler(paymentService.initiatePayment))

router.use('/verify', authMiddleware, requirePermission('payments_process'))
router.post('/verify', asyncHandler(paymentService.verifyPayment))

router.use('/refund', authMiddleware, requirePermission('payments_refund'))
router.post('/refund', asyncHandler(paymentService.refundPayment))

router.use('/bank/submit', authMiddleware, requirePermission('payments_process'))
router.post('/bank/submit', asyncHandler(paymentService.submitBankPayment))

router.use('/bank/verify', authMiddleware, requirePermission('finance_edit'))
router.post('/bank/verify', asyncHandler(paymentService.verifyBankPayment))

router.use('/bank/reject', authMiddleware, requirePermission('finance_edit'))
router.post('/bank/reject', asyncHandler(paymentService.rejectBankPayment))

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
    if (!verifyWebhookSecret(req.headers['x-hospiflow-webhook-secret'] as string | undefined, 'M-Pesa')) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook credentials' } })
    }
    const adapter = factory.getProvider('MPESA')
    const response = await adapter.handleWebhook(req.body)
    const result = await applyProviderWebhook('M-Pesa', response)
    return res.status(result.status).json(result.body)
  } catch (error) {
    return webhookErrorResponse(res, 'M-Pesa', error)
  }
}))

router.post('/webhook/stripe', asyncHandler(async (req: Request, res: Response) => {
  try {
    const adapter = factory.getProvider('STRIPE')
    const response = await adapter.handleWebhook(req.body, req.headers['stripe-signature'] as string | undefined)
    const result = await applyProviderWebhook('Stripe', response)
    return res.status(result.status).json(result.body)
  } catch (error) {
    return webhookErrorResponse(res, 'Stripe', error)
  }
}))

export default router
