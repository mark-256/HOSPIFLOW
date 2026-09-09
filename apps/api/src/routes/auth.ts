import { Router } from 'express'
import { authController } from '../controllers/authController'
import { authMiddleware } from '../middleware/auth'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.post('/login', asyncHandler(authController.login))
router.get('/me', authMiddleware, asyncHandler(authController.me))
router.post('/logout', authMiddleware, asyncHandler(authController.logout))

export default router
