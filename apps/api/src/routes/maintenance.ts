import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { maintenanceController } from '../controllers/maintenanceController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(maintenanceController.list))
router.post('/', asyncHandler(maintenanceController.create))
router.patch('/:id', asyncHandler(maintenanceController.update))
export default router
