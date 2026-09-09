import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'

const router = Router()

router.use(authMiddleware, requirePermission('payments_process'))

router.get('/', (_req, res) => {
  res.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } })
})

router.post('/', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Use order payment endpoints instead' } })
})

router.get('/:id', (_req, res) => {
  res.json({ success: true, data: {} })
})

router.patch('/:id', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Refund endpoint not yet implemented' } })
})

router.delete('/:id', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Refund endpoint not yet implemented' } })
})

export default router
