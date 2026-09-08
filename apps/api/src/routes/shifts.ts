import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { shiftsController } from '../controllers/shiftsController'

const router = Router()
router.use(authMiddleware)
router.get('/', shiftsController.list)
router.post('/open', shiftsController.open)
router.post('/:id/close', shiftsController.close)
export default router
