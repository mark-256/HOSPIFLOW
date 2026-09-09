import { Router } from 'express'
import { organizationsController } from '../controllers/organizationsController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.get('/', authMiddleware, asyncHandler(organizationsController.getOrganizations))
router.post('/', authMiddleware, requirePermission('users_manage'), asyncHandler(organizationsController.createOrganization))
router.get('/:id', authMiddleware, asyncHandler(organizationsController.getOrganization))
router.patch('/:id', authMiddleware, requirePermission('users_manage'), asyncHandler(organizationsController.updateOrganization))

export default router
