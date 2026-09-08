import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { menusController } from '../controllers/menusController'

const router = Router()
router.use(authMiddleware)
router.get('/', menusController.list)
router.post('/', menusController.create)
export default router
