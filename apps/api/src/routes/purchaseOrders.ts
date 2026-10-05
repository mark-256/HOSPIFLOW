import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { purchaseOrdersController } from '../controllers/purchaseOrdersController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('procurement_view'), asyncHandler(purchaseOrdersController.list))
router.post('/', requirePermission('procurement_edit'), asyncHandler(purchaseOrdersController.create))
router.get('/:id', requirePermission('procurement_view'), asyncHandler(purchaseOrdersController.get))
router.patch('/:id', requirePermission('procurement_edit'), asyncHandler(purchaseOrdersController.update))
router.delete('/:id', requirePermission('procurement_edit'), asyncHandler(purchaseOrdersController.remove))
export default router
