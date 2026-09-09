import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { productsController } from '../controllers/productsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(productsController.list))
router.post('/', asyncHandler(productsController.create))
export default router
