import { PrismaClient } from '@hospiflow/database'
import { AuthenticatedRequest } from '../middleware/auth'
import { Response } from 'express'

const prisma = new PrismaClient()

export const aiController = {
  insights: async (req: AuthenticatedRequest, res: Response) => {
    const prompt = typeof req.query.prompt === 'string' ? req.query.prompt.trim() : ''
    const [orders, inventory, reservations, housekeeping, maintenance] = await Promise.all([
      prisma.order.findMany({ where: { outlet: { property: { organizationId: req.user!.organizationId } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.inventoryItem.findMany({ where: { organizationId: req.user!.organizationId } }),
      prisma.reservation.findMany({ where: { property: { organizationId: req.user!.organizationId }, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } }, orderBy: { checkInDate: 'asc' }, take: 20 }),
      prisma.housekeepingTask.findMany({ where: { property: { organizationId: req.user!.organizationId }, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSPECTION'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.maintenanceTicket.findMany({ where: { property: { organizationId: req.user!.organizationId }, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ])
    const lowStock = inventory.filter((item) => Number(item.reorderLevel) > 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayOrders = orders.filter((order) => new Date(order.createdAt) >= today)
    const sales = todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)
    const insights = [
      { priority: todayOrders.length > 0 ? 'HIGH' : 'MEDIUM', title: 'Today’s sales pulse', detail: `${todayOrders.length} order(s) recorded today for KES ${sales.toFixed(2)}. Review unpaid balances before closing the shift.` },
      { priority: reservations.length > 0 ? 'HIGH' : 'LOW', title: 'Arrival queue', detail: `${reservations.length} reservation(s) need front-office attention. Confirm guest details and room allocation before arrival.` },
      { priority: housekeeping.length > 0 ? 'HIGH' : 'LOW', title: 'Room readiness', detail: `${housekeeping.length} housekeeping task(s) are not yet verified. Prioritize rooms linked to today’s arrivals.` },
      { priority: maintenance.length > 0 ? 'MEDIUM' : 'LOW', title: 'Maintenance watch', detail: `${maintenance.length} maintenance ticket(s) remain open. Escalate urgent tickets before assigning rooms.` },
      { priority: lowStock.length > 0 ? 'HIGH' : 'LOW', title: 'Stock protection', detail: lowStock.length > 0 ? `${lowStock.length} inventory item(s) are at or below reorder level. Create a purchase order before service is affected.` : 'No reorder thresholds are currently triggered.' },
    ]
    const normalized = prompt.toLowerCase()
    const response = normalized.includes('sales') ? insights[0] : normalized.includes('reservation') || normalized.includes('arrival') ? insights[1] : normalized.includes('housekeep') || normalized.includes('room') ? insights[2] : normalized.includes('maintenance') ? insights[3] : normalized.includes('stock') || normalized.includes('inventory') || normalized.includes('procurement') ? insights[4] : { priority: 'MEDIUM', title: 'Suggested next action', detail: 'Start with the highest-priority operational item above, then confirm open guest, room, and payment exceptions.' }
    return res.json({ success: true, data: { prompt, summary: `HOSPIFLOW found ${insights.filter((insight) => insight.priority === 'HIGH').length} high-priority item(s).`, insights, response, generatedAt: new Date().toISOString() } })
  },
}
