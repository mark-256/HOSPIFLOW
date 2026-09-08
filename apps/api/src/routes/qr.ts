import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { qrController } from '../controllers/qrController'

const router = Router()
router.use(authMiddleware)
router.post('/generate', qrController.generate)
router.get('/lookup/:token', qrController.lookup)
export default router
