import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { foliosController } from '../controllers/foliosController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('folios_view'), asyncHandler(foliosController.list))
router.get('/:id', requirePermission('folios_view'), asyncHandler(foliosController.get))
router.post('/:id/transactions', requirePermission('folios_edit'), asyncHandler(foliosController.createTransaction))
router.post('/:id/close', requirePermission('folios_edit'), asyncHandler(foliosController.close))
export default router
