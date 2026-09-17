import { Router } from 'express'
import { aiController } from '../controllers/aiController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/insights', asyncHandler(aiController.insights))

export default router
