import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { guestsController } from '../controllers/guestsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(guestsController.list))
router.post('/', asyncHandler(guestsController.create))
router.get('/:id', asyncHandler(guestsController.get))
router.patch('/:id', asyncHandler(guestsController.update))
export default router
