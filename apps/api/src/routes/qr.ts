import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { qrController } from '../controllers/qrController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.post('/generate', authMiddleware, asyncHandler(qrController.generate))
router.get('/lookup/:token', asyncHandler(qrController.lookup))
router.post('/orders', asyncHandler(qrController.createOrder))
export default router
