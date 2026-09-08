import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { reservationsController } from '../controllers/reservationsController'

const router = Router()
router.use(authMiddleware)
router.get('/', reservationsController.list)
router.post('/', reservationsController.create)
router.get('/:id', reservationsController.get)
router.patch('/:id', reservationsController.updateStatus)
export default router
