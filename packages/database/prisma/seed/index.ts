import { PrismaClient } from '../../src/generated'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: {
      name: 'Demo Hospitality Group',
      slug: 'demo-org',
      status: 'ACTIVE',
    },
  })

  const property = await prisma.property.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'NAIROBI-HQ' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Nairobi Grand Hotel',
      code: 'NAIROBI-HQ',
      city: 'Nairobi',
      country: 'Kenya',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
    },
  })

  const outlet = await prisma.outlet.upsert({
    where: { propertyId_code: { propertyId: property.id, code: 'MAIN-RESTAURANT' } },
    update: {},
    create: {
      propertyId: property.id,
      name: 'Main Restaurant',
      code: 'MAIN-RESTAURANT',
      type: 'RESTAURANT',
    },
  })

  const role = await prisma.appRole.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'ORG_ADMIN' } },
    update: {
      permissions: [
        'orders_create', 'orders_view', 'orders_edit', 'orders_cancel', 'orders_discount',
        'payments_process', 'payments_refund',
        'inventory_view', 'inventory_adjust',
        'reports_view',
        'users_manage',
        'reservations_create', 'reservations_edit', 'reservations_cancel',
        'guests_view', 'guests_edit',
        'folios_view', 'folios_edit',
        'rooms_view', 'rooms_edit',
        'housekeeping_view', 'housekeeping_edit',
        'maintenance_view', 'maintenance_edit',
        'finance_view', 'finance_edit',
        'procurement_view', 'procurement_edit',
        'menu_manage',
        'shifts_view', 'shifts_manage',
      ],
    },
    create: {
      organizationId: org.id,
      name: 'ORG_ADMIN',
      description: 'Organization Admin',
      isSystem: true,
      permissions: [
        'orders_create', 'orders_view', 'orders_edit', 'orders_cancel', 'orders_discount',
        'payments_process', 'payments_refund',
        'inventory_view', 'inventory_adjust',
        'reports_view',
        'users_manage',
        'reservations_create', 'reservations_edit', 'reservations_cancel',
        'guests_view', 'guests_edit',
        'folios_view', 'folios_edit',
        'rooms_view', 'rooms_edit',
        'housekeeping_view', 'housekeeping_edit',
        'maintenance_view', 'maintenance_edit',
        'finance_view', 'finance_edit',
        'procurement_view', 'procurement_edit',
        'menu_manage',
        'shifts_view', 'shifts_manage',
      ],
    },
  })

  const passwordHash = await bcrypt.hash('admin123', 10)

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@hospiflow.com' } },
    update: {},
    create: {
      organizationId: org.id,
      roleId: role.id,
      email: 'admin@hospiflow.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
    },
  })

  console.log('Seeding completed')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
