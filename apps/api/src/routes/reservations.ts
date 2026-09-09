import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { reservationsController } from '../controllers/reservationsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(reservationsController.list))
router.post('/', asyncHandler(reservationsController.create))
router.get('/:id', asyncHandler(reservationsController.get))
router.patch('/:id', asyncHandler(reservationsController.updateStatus))
export default router
