import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { maintenanceController } from '../controllers/maintenanceController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('maintenance_view'), asyncHandler(maintenanceController.list))
router.post('/', requirePermission('maintenance_edit'), asyncHandler(maintenanceController.create))
router.patch('/:id', requirePermission('maintenance_edit'), asyncHandler(maintenanceController.update))
export default router
