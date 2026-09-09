import { Router } from 'express'
import { propertiesController } from '../controllers/propertiesController'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.get('/', authMiddleware, asyncHandler(propertiesController.getProperties))
router.post('/', authMiddleware, requirePermission('users_manage'), asyncHandler(propertiesController.createProperty))
router.get('/:id', authMiddleware, asyncHandler(propertiesController.getProperty))
router.patch('/:id', authMiddleware, requirePermission('users_manage'), asyncHandler(propertiesController.updateProperty))

export default router
