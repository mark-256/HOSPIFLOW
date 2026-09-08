import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { housekeepingController } from '../controllers/housekeepingController'

const router = Router()
router.use(authMiddleware)
router.get('/', housekeepingController.list)
router.post('/', housekeepingController.create)
router.patch('/:id', housekeepingController.update)
export default router
