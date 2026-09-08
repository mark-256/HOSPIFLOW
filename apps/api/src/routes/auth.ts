import { Router } from 'express'
import { authController } from '../controllers/authController'

const router = Router()

router.get('/me', authController.me)

export default router
