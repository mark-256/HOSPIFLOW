import { Router } from 'express'
import { outletsController } from '../controllers/outletsController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(outletsController.list))
router.post('/', asyncHandler(outletsController.create))
router.get('/:id', asyncHandler(outletsController.get))
router.patch('/:id', asyncHandler(outletsController.update))
router.delete('/:id', asyncHandler(outletsController.remove))

export default router
