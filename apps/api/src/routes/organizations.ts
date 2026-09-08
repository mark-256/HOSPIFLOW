import { Router } from 'express'
import { organizationsController } from '../controllers/organizationsController'
import { authMiddleware, requirePermission } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware, organizationsController.getOrganizations)
router.post('/', authMiddleware, requirePermission('users_manage'), organizationsController.createOrganization)
router.get('/:id', authMiddleware, organizationsController.getOrganization)
router.patch('/:id', authMiddleware, requirePermission('users_manage'), organizationsController.updateOrganization)

export default router
