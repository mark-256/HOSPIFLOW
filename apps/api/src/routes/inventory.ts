import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { inventoryController } from '../controllers/inventoryController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', asyncHandler(inventoryController.list))
router.post('/', asyncHandler(inventoryController.create))
router.get('/movements', asyncHandler(inventoryController.movements))
router.post('/movements', asyncHandler(inventoryController.createMovement))
export default router
