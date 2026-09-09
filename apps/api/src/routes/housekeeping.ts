import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { housekeepingController } from '../controllers/housekeepingController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(housekeepingController.list))
router.post('/', asyncHandler(housekeepingController.create))
router.patch('/:id', asyncHandler(housekeepingController.update))
export default router
