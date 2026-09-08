import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'

const router = Router()

router.use(authMiddleware, requirePermission('users_manage'))

router.get('/', (_req, res) => {
  res.json({ success: true, data: [] })
})

router.post('/', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } })
})

router.get('/:id', (_req, res) => {
  res.json({ success: true, data: {} })
})

router.patch('/:id', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } })
})

router.delete('/:id', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented' } })
})

export default router
