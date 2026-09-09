import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { qrController } from '../controllers/qrController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.post('/generate', asyncHandler(qrController.generate))
router.get('/lookup/:token', asyncHandler(qrController.lookup))
export default router
