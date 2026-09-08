import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { tablesController } from '../controllers/tablesController'

const router = Router()
router.use(authMiddleware)
router.get('/', tablesController.list)
router.post('/', tablesController.create)
router.patch('/:id', tablesController.update)
export default router
