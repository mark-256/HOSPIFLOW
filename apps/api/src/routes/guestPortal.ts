import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { guestPortalController } from '../controllers/guestPortalController'

const router = Router()
router.use(authMiddleware, requirePermission('guests_view'))
router.get('/reservations', guestPortalController.getReservations)
router.get('/folios', guestPortalController.getFolios)
export default router
