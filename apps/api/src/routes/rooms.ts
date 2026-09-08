import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { roomsController } from '../controllers/roomsController'

const router = Router()
router.use(authMiddleware)
router.get('/', roomsController.list)
router.post('/', roomsController.create)
router.patch('/:id', roomsController.update)
export default router
