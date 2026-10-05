import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { housekeepingController } from '../controllers/housekeepingController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('housekeeping_view'), asyncHandler(housekeepingController.list))
router.post('/', requirePermission('housekeeping_edit'), asyncHandler(housekeepingController.create))
router.patch('/:id', requirePermission('housekeeping_edit'), asyncHandler(housekeepingController.update))
export default router
