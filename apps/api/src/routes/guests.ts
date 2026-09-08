import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { guestsController } from '../controllers/guestsController'

const router = Router()
router.use(authMiddleware)
router.get('/', guestsController.list)
router.post('/', guestsController.create)
router.get('/:id', guestsController.get)
router.patch('/:id', guestsController.update)
export default router
