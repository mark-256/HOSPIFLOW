import { Router } from 'express'
import { authController } from '../controllers/authController'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/login', authController.login)
router.get('/me', authMiddleware, authController.me)
router.post('/logout', authMiddleware, authController.logout)

export default router
