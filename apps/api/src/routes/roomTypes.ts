import { Router } from 'express'
import { roomTypesController } from '../controllers/roomTypesController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(roomTypesController.list))
router.post('/', asyncHandler(roomTypesController.create))
router.get('/:id', asyncHandler(roomTypesController.get))
router.patch('/:id', asyncHandler(roomTypesController.update))
router.delete('/:id', asyncHandler(roomTypesController.remove))

export default router
