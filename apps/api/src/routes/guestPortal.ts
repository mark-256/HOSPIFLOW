import { Router } from 'express'
import { authMiddleware, requirePermission } from '../middleware/auth'
import { guestPortalController } from '../controllers/guestPortalController'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, requirePermission('guests_view'))
router.get('/reservations', asyncHandler(guestPortalController.getReservations))
router.get('/folios', asyncHandler(guestPortalController.getFolios))
export default router
