import { Router } from 'express'
import { roomTypesController } from '../controllers/roomTypesController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(roomTypesController.list))
router.post('/', requirePermission('users_manage'), asyncHandler(roomTypesController.create))
router.get('/:id', asyncHandler(roomTypesController.get))
router.patch('/:id', requirePermission('users_manage'), asyncHandler(roomTypesController.update))
router.delete('/:id', requirePermission('users_manage'), asyncHandler(roomTypesController.remove))

export default router
