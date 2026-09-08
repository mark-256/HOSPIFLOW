import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { inventoryController } from '../controllers/inventoryController'

const router = Router()
router.use(authMiddleware)
router.get('/', inventoryController.list)
router.post('/', inventoryController.create)
router.get('/movements', inventoryController.movements)
router.post('/movements', inventoryController.createMovement)
export default router
