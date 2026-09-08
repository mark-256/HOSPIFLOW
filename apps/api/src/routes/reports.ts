import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { reportsController } from '../controllers/reportsController'

const router = Router()
router.use(authMiddleware)
router.get('/sales', reportsController.sales)
router.get('/occupancy', reportsController.occupancy)
export default router
