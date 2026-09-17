import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { config } from './config'
import { errorHandler } from './middleware/errorHandler'
import { notFoundHandler } from './middleware/notFoundHandler'
import authRoutes from './routes/auth'
import usersRoutes from './routes/users'
import organizationsRoutes from './routes/organizations'
import propertiesRoutes from './routes/properties'
import outletsRoutes from './routes/outlets'
import terminalsRoutes from './routes/terminals'
import roomsRoutes from './routes/rooms'
import roomTypesRoutes from './routes/roomTypes'
import reservationsRoutes from './routes/reservations'
import guestsRoutes from './routes/guests'
import foliosRoutes from './routes/folios'
import tablesRoutes from './routes/tables'
import menusRoutes from './routes/menus'
import productsRoutes from './routes/products'
import ordersRoutes from './routes/orders'
import paymentsRoutes from './routes/payments'
import inventoryRoutes from './routes/inventory'
import suppliersRoutes from './routes/suppliers'
import purchaseOrdersRoutes from './routes/purchaseOrders'
import housekeepingRoutes from './routes/housekeeping'
import maintenanceRoutes from './routes/maintenance'
import shiftsRoutes from './routes/shifts'
import reportsRoutes from './routes/reports'
import onlineOrdersRoutes from './routes/onlineOrders'
import loyaltyRoutes from './routes/loyalty'
import qrRoutes from './routes/qr'
import guestPortalRoutes from './routes/guestPortal'
import healthRoutes from './routes/health'
import backupRoutes from './routes/backups'
import aiRoutes from './routes/ai'

const app = express()

app.use(helmet())
app.use(cors({ origin: config.frontendUrl, credentials: true }))
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/', limiter)

app.get('/health', healthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/organizations', organizationsRoutes)
app.use('/api/properties', propertiesRoutes)
app.use('/api/outlets', outletsRoutes)
app.use('/api/terminals', terminalsRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/room-types', roomTypesRoutes)
app.use('/api/reservations', reservationsRoutes)
app.use('/api/guests', guestsRoutes)
app.use('/api/folios', foliosRoutes)
app.use('/api/tables', tablesRoutes)
app.use('/api/menus', menusRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/suppliers', suppliersRoutes)
app.use('/api/purchase-orders', purchaseOrdersRoutes)
app.use('/api/housekeeping', housekeepingRoutes)
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/shifts', shiftsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/online-orders', onlineOrdersRoutes)
app.use('/api/loyalty', loyaltyRoutes)
app.use('/api/qr', qrRoutes)
app.use('/api/guest-portal', guestPortalRoutes)
app.use('/api/admin/backups', backupRoutes)
app.use('/api/ai', aiRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
