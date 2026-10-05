import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { menusController } from '../controllers/menusController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(menusController.list))
router.post('/', requirePermission('menu_manage'), asyncHandler(menusController.create))
export default router
