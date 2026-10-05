import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { reportsController } from '../controllers/reportsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/sales', requirePermission('reports_view'), asyncHandler(reportsController.sales))
router.get('/occupancy', requirePermission('reports_view'), asyncHandler(reportsController.occupancy))
export default router
