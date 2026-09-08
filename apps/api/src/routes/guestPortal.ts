import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { guestPortalController } from '../controllers/guestPortalController'

const router = Router()
router.use(authMiddleware)
router.get('/reservations', guestPortalController.getReservations)
router.get('/folios', guestPortalController.getFolios)
export default router
