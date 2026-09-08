import { Router } from 'express'
import { propertiesController } from '../controllers/propertiesController'
import { authMiddleware, requirePermission } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware, propertiesController.getProperties)
router.post('/', authMiddleware, requirePermission('users_manage'), propertiesController.createProperty)
router.get('/:id', authMiddleware, propertiesController.getProperty)
router.patch('/:id', authMiddleware, requirePermission('users_manage'), propertiesController.updateProperty)

export default router
