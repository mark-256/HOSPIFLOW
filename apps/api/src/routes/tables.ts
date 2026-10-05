import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { tablesController } from '../controllers/tablesController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(tablesController.list))
router.post('/', requirePermission('users_manage'), asyncHandler(tablesController.create))
router.patch('/:id', requirePermission('users_manage'), asyncHandler(tablesController.update))
export default router
