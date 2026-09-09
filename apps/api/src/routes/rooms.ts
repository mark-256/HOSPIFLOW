import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { roomsController } from '../controllers/roomsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(roomsController.list))
router.post('/', asyncHandler(roomsController.create))
router.patch('/:id', asyncHandler(roomsController.update))
export default router
