import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { foliosController } from '../controllers/foliosController'

const router = Router()
router.use(authMiddleware)
router.get('/', foliosController.list)
router.get('/:id', foliosController.get)
router.post('/:id/transactions', foliosController.createTransaction)
router.post('/:id/close', foliosController.close)
export default router
