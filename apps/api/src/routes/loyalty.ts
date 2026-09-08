import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { loyaltyController } from '../controllers/loyaltyController'

const router = Router()
router.use(authMiddleware)
router.get('/account', loyaltyController.getAccount)
router.post('/points', loyaltyController.addPoints)
export default router
