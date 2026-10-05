import { Router } from 'express'
import { terminalsController } from '../controllers/terminalsController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(terminalsController.list))
router.post('/', requirePermission('users_manage'), asyncHandler(terminalsController.create))
router.get('/:id', asyncHandler(terminalsController.get))
router.patch('/:id', requirePermission('users_manage'), asyncHandler(terminalsController.update))
router.delete('/:id', requirePermission('users_manage'), asyncHandler(terminalsController.remove))

export default router
