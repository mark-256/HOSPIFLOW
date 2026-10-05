import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { suppliersController } from '../controllers/suppliersController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('procurement_view'), asyncHandler(suppliersController.list))
router.post('/', requirePermission('procurement_edit'), asyncHandler(suppliersController.create))
router.get('/:id', requirePermission('procurement_view'), asyncHandler(suppliersController.get))
router.patch('/:id', requirePermission('procurement_edit'), asyncHandler(suppliersController.update))
router.delete('/:id', requirePermission('procurement_edit'), asyncHandler(suppliersController.remove))
export default router
