import { Router } from 'express'
import { aiController } from '../controllers/aiController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, requirePermission('reports_view'))
router.get('/insights', asyncHandler(aiController.insights))

export default router
