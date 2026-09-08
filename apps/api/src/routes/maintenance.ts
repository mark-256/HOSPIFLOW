import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { maintenanceController } from '../controllers/maintenanceController'

const router = Router()
router.use(authMiddleware)
router.get('/', maintenanceController.list)
router.post('/', maintenanceController.create)
router.patch('/:id', maintenanceController.update)
export default router
