import { Router } from 'express'
import { purchaseOrdersController } from '../controllers/purchaseOrdersController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(purchaseOrdersController.list))
router.post('/', asyncHandler(purchaseOrdersController.create))
router.get('/:id', asyncHandler(purchaseOrdersController.get))
router.patch('/:id', asyncHandler(purchaseOrdersController.update))
router.delete('/:id', asyncHandler(purchaseOrdersController.remove))

export default router
