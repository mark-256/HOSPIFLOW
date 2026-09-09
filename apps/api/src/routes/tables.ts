import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { tablesController } from '../controllers/tablesController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(tablesController.list))
router.post('/', asyncHandler(tablesController.create))
router.patch('/:id', asyncHandler(tablesController.update))
export default router
