import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { onlineOrdersController } from '../controllers/onlineOrdersController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('orders_view'), asyncHandler(onlineOrdersController.list))
router.post('/', requirePermission('orders_create'), asyncHandler(onlineOrdersController.create))
export default router
