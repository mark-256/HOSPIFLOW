import { Router } from 'express'
import { suppliersController } from '../controllers/suppliersController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(suppliersController.list))
router.post('/', asyncHandler(suppliersController.create))
router.get('/:id', asyncHandler(suppliersController.get))
router.patch('/:id', asyncHandler(suppliersController.update))
router.delete('/:id', asyncHandler(suppliersController.remove))

export default router
