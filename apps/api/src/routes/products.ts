import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { productsController } from '../controllers/productsController'

const router = Router()
router.use(authMiddleware)
router.get('/', productsController.list)
router.post('/', productsController.create)
export default router
