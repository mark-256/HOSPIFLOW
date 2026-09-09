import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { ordersController } from '../controllers/ordersController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(ordersController.list))
router.post('/', requirePermission('orders_create'), asyncHandler(ordersController.create))
router.get('/:id', asyncHandler(ordersController.get))
router.patch('/:id/status', requirePermission('orders_edit'), asyncHandler(ordersController.updateStatus))
router.post('/:id/items', requirePermission('orders_edit'), asyncHandler(ordersController.addItem))
router.post('/:id/pay', requirePermission('payments_process'), asyncHandler(ordersController.pay))
export default router
