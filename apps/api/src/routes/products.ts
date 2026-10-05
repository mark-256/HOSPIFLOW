import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { productsController } from '../controllers/productsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(productsController.list))
router.post('/', requirePermission('menu_manage'), asyncHandler(productsController.create))
export default router
