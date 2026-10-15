import bcrypt from 'bcrypt'
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { PrismaClient } from '../../src/generated'

dotenv.config({ path: resolve(process.env.INIT_CWD ?? process.cwd(), '.env') })

const prisma = new PrismaClient()

const ADMIN_PERMISSIONS = [
  'orders_create',
  'orders_view',
  'orders_edit',
  'orders_cancel',
  'orders_discount',
  'payments_process',
  'payments_refund',
  'inventory_view',
  'inventory_adjust',
  'reports_view',
  'users_manage',
  'reservations_create',
  'reservations_edit',
  'reservations_cancel',
  'guests_view',
  'guests_edit',
  'folios_view',
  'folios_edit',
  'rooms_view',
  'rooms_edit',
  'housekeeping_view',
  'housekeeping_edit',
  'maintenance_view',
  'maintenance_edit',
  'finance_view',
  'finance_edit',
  'procurement_view',
  'procurement_edit',
  'menu_manage',
  'shifts_view',
  'shifts_manage',
] as const

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required installation setting: ${name}`)
  }
  return value
}

function readInstallSettings() {
  const adminPassword = process.env.HOTEL_ADMIN_PASSWORD
  if (!adminPassword?.trim()) {
    throw new Error('Missing required installation setting: HOTEL_ADMIN_PASSWORD')
  }

  const settings = {
    organizationName: requiredSetting('HOTEL_ORGANIZATION_NAME'),
    organizationSlug: requiredSetting('HOTEL_ORGANIZATION_SLUG').toLowerCase(),
    propertyName: requiredSetting('HOTEL_PROPERTY_NAME'),
    propertyCode: requiredSetting('HOTEL_PROPERTY_CODE').toUpperCase(),
    city: requiredSetting('HOTEL_PROPERTY_CITY'),
    country: requiredSetting('HOTEL_PROPERTY_COUNTRY'),
    currency: requiredSetting('HOTEL_PROPERTY_CURRENCY').toUpperCase(),
    timezone: requiredSetting('HOTEL_PROPERTY_TIMEZONE'),
    adminEmail: requiredSetting('HOTEL_ADMIN_EMAIL').toLowerCase(),
    adminPassword,
    adminFirstName: requiredSetting('HOTEL_ADMIN_FIRST_NAME'),
    adminLastName: requiredSetting('HOTEL_ADMIN_LAST_NAME'),
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(settings.organizationSlug)) {
    throw new Error('HOTEL_ORGANIZATION_SLUG must contain lowercase letters, numbers, and single hyphens only.')
  }
  if (!/^[A-Z0-9_-]+$/.test(settings.propertyCode)) {
    throw new Error('HOTEL_PROPERTY_CODE must contain only letters, numbers, underscores, or hyphens.')
  }
  if (!/^[A-Z]{3}$/.test(settings.currency)) {
    throw new Error('HOTEL_PROPERTY_CURRENCY must be a three-letter currency code.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.adminEmail)) {
    throw new Error('HOTEL_ADMIN_EMAIL must be a valid email address.')
  }
  if (settings.adminPassword.length < 12) {
    throw new Error('HOTEL_ADMIN_PASSWORD must be at least 12 characters long.')
  }

  try {
    new Intl.DateTimeFormat('en', { timeZone: settings.timezone })
  } catch {
    throw new Error('HOTEL_PROPERTY_TIMEZONE must be a valid IANA time zone.')
  }

  return settings
}

async function main() {
  const settings = readInstallSettings()
  const passwordHash = await bcrypt.hash(settings.adminPassword, 12)

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: settings.organizationName,
        slug: settings.organizationSlug,
        status: 'ACTIVE',
      },
    })

    await tx.property.create({
      data: {
        organizationId: organization.id,
        name: settings.propertyName,
        code: settings.propertyCode,
        city: settings.city,
        country: settings.country,
        currency: settings.currency,
        timezone: settings.timezone,
      },
    })

    const role = await tx.appRole.create({
      data: {
        organizationId: organization.id,
        name: 'ORG_ADMIN',
        description: 'Organization administrator',
        isSystem: true,
        permissions: [...ADMIN_PERMISSIONS],
      },
    })

    await tx.user.create({
      data: {
        organizationId: organization.id,
        roleId: role.id,
        email: settings.adminEmail,
        passwordHash,
        firstName: settings.adminFirstName,
        lastName: settings.adminLastName,
      },
    })
  })

  console.log(
    `Initial hotel installation created for "${settings.propertyName}" (${settings.adminEmail}).`,
  )
}

main()
  .catch((error: unknown) => {
    console.error('Hotel installation setup failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
