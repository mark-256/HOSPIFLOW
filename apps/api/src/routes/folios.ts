import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { foliosController } from '../controllers/foliosController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(foliosController.list))
router.get('/:id', asyncHandler(foliosController.get))
router.post('/:id/transactions', asyncHandler(foliosController.createTransaction))
router.post('/:id/close', asyncHandler(foliosController.close))
export default router
