import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { roomsController } from '../controllers/roomsController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(roomsController.list))
router.post('/', requirePermission('rooms_edit'), asyncHandler(roomsController.create))
router.patch('/:id', requirePermission('rooms_edit'), asyncHandler(roomsController.update))
export default router
