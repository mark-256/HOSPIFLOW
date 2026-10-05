import { Router } from 'express'
import { outletsController } from '../controllers/outletsController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(outletsController.list))
router.post('/', requirePermission('users_manage'), asyncHandler(outletsController.create))
router.get('/:id', asyncHandler(outletsController.get))
router.patch('/:id', requirePermission('users_manage'), asyncHandler(outletsController.update))
router.delete('/:id', requirePermission('users_manage'), asyncHandler(outletsController.remove))

export default router
