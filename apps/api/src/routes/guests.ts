import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { guestsController } from '../controllers/guestsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('guests_view'), asyncHandler(guestsController.list))
router.post('/', requirePermission('guests_edit'), asyncHandler(guestsController.create))
router.get('/:id', requirePermission('guests_view'), asyncHandler(guestsController.get))
router.patch('/:id', requirePermission('guests_edit'), asyncHandler(guestsController.update))
export default router
