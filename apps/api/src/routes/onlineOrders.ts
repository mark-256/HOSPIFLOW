import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { onlineOrdersController } from '../controllers/onlineOrdersController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(onlineOrdersController.list))
router.post('/', asyncHandler(onlineOrdersController.create))
export default router
