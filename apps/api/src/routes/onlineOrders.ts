import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { onlineOrdersController } from '../controllers/onlineOrdersController'

const router = Router()
router.use(authMiddleware)
router.get('/', onlineOrdersController.list)
router.post('/', onlineOrdersController.create)
export default router
