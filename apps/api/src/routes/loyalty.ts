import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { loyaltyController } from '../controllers/loyaltyController'

const router = Router()
router.use(authMiddleware, requirePermission('guests_view'))
router.get('/account', loyaltyController.getAccount)
router.post('/points', requirePermission('guests_edit'), loyaltyController.addPoints)
export default router
