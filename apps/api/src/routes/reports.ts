import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { reportsController } from '../controllers/reportsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/sales', asyncHandler(reportsController.sales))
router.get('/occupancy', asyncHandler(reportsController.occupancy))
export default router
