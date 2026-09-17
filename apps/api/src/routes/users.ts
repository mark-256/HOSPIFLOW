import { Router } from 'express'
import { usersController } from '../controllers/usersController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, requirePermission('users_manage'))
router.get('/', asyncHandler(usersController.getUsers))
router.post('/', asyncHandler(usersController.createUser))
router.get('/:id', asyncHandler(usersController.getUser))
router.patch('/:id', asyncHandler(usersController.updateUser))
router.delete('/:id', asyncHandler(usersController.deleteUser))

export default router
