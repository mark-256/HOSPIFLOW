import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { loyaltyController } from '../controllers/loyaltyController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, requirePermission('guests_view'))
router.get('/account', asyncHandler(loyaltyController.getAccount))
router.post('/points', requirePermission('guests_edit'), asyncHandler(loyaltyController.addPoints))
export default router
