import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { inventoryController } from '../controllers/inventoryController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)
router.get('/', requirePermission('inventory_view'), asyncHandler(inventoryController.list))
router.post('/', requirePermission('inventory_adjust'), asyncHandler(inventoryController.create))
router.get('/movements', requirePermission('inventory_view'), asyncHandler(inventoryController.movements))
router.post('/movements', requirePermission('inventory_adjust'), asyncHandler(inventoryController.createMovement))
export default router
