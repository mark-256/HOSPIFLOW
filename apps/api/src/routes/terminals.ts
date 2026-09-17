import { Router } from 'express'
import { terminalsController } from '../controllers/terminalsController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(terminalsController.list))
router.post('/', asyncHandler(terminalsController.create))
router.get('/:id', asyncHandler(terminalsController.get))
router.patch('/:id', asyncHandler(terminalsController.update))
router.delete('/:id', asyncHandler(terminalsController.remove))

export default router
