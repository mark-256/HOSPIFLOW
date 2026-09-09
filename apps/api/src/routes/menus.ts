import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { menusController } from '../controllers/menusController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(menusController.list))
router.post('/', asyncHandler(menusController.create))
export default router
