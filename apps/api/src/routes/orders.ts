import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { ordersController } from '../controllers/ordersController'

const router = Router()
router.use(authMiddleware)
router.get('/', ordersController.list)
router.post('/', requirePermission('orders_create'), ordersController.create)
router.get('/:id', ordersController.get)
router.patch('/:id/status', requirePermission('orders_edit'), ordersController.updateStatus)
router.post('/:id/items', requirePermission('orders_edit'), ordersController.addItem)
router.post('/:id/pay', requirePermission('payments_process'), ordersController.pay)
export default router
