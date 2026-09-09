import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { shiftsController } from '../controllers/shiftsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(shiftsController.list))
router.post('/open', asyncHandler(shiftsController.open))
router.post('/:id/close', asyncHandler(shiftsController.close))
export default router
