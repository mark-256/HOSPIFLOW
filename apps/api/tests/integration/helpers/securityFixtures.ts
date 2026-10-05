import { PrismaClient } from '@hospiflow/database'
import bcrypt from 'bcrypt'
import { setupTestDatabase } from './app'

/**
 * B39 — deterministic two-tenant security fixtures.
 *
 * Every identifier below is captured from the object that was actually created,
 * so the security suite never depends on hardcoded/stale row IDs. Fixture A and
 * fixture B are structurally equivalent across every domain the B39 audit
 * covers, which is what makes the cross-tenant assertions meaningful.
 */

export interface TenantFixture {
  organizationId: string
  propertyId: string
  outletId: string
  roomTypeId: string
  roomId: string
  tableId: string
  terminalId: string
  menuId: string
  categoryId: string
  productId: string
  inventoryItemId: string
  guestId: string
  reservationId: string
  folioId: string
  supplierId: string
  purchaseOrderId: string
  orderId: string
  shiftId: string
  housekeepingTaskId: string
  maintenanceTicketId: string
  loyaltyAccountId: string
}

export type SecurityUserKey =
  | 'adminA'
  | 'adminB'
  | 'superAdminA'
  | 'superAdminB'
  | 'receptionistA'
  | 'cashierA'
  | 'chefA'
  | 'waiterA'
  | 'housekeeperA'
  | 'storekeeperA'
  | 'accountantA'
  | 'auditorA'
  | 'restrictedA'
  | 'restrictedB'

export interface SecurityFixture {
  orgA: TenantFixture
  orgB: TenantFixture
  users: Record<SecurityUserKey, string>
  emails: Record<SecurityUserKey, string>
  passwords: Record<SecurityUserKey, string>
  roleIds: {
    orgA: Record<string, string>
    orgB: Record<string, string>
  }
  seed: any
}

const PASSWORD = 'B39-Secure@123'

async function createExtraUser(prisma: PrismaClient, organizationId: string, roleId: string, email: string) {
  return prisma.user.create({
    data: {
      organizationId,
      roleId,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      firstName: 'B39',
      lastName: email.split('@')[0],
      isActive: true,
    },
  })
}

async function buildTenant(
  prisma: PrismaClient,
  seed: any,
  side: 'orgA' | 'orgB',
  roleIds: Record<string, string>,
  creatorUserId: string
): Promise<TenantFixture> {
  const organizationId = seed[side].organizationId
  const propertyId = seed[side].propertyId
  const outletId = seed[side].outletId
  const roomTypeId = seed[side].roomTypeId
  const roomId = seed[side].room1Id
  const tableId = seed[side].tableId
  const terminalId = seed[side].terminalId

  // Supplier + purchase order
  const supplier = await prisma.supplier.create({
    data: {
      organizationId,
      name: `${side.toUpperCase()} Confidential Supplier`,
      code: `${side.toUpperCase()}-SUP-001`,
      taxNumber: `${side.toUpperCase()}-TAX-999`,
      isActive: true,
    },
  })

  const inventoryItem = await prisma.inventoryItem.create({
    data: {
      organizationId,
      name: `${side.toUpperCase()} Secret Inventory Item`,
      sku: `${side.toUpperCase()}-SECRET-SKU`,
      category: 'Confidential',
      unit: 'kg',
      unitCost: 42.5,
      reorderLevel: 3,
    },
  })

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      supplierId: supplier.id,
      orderNumber: `${side.toUpperCase()}-PO-0001`,
      status: 'DRAFT',
      subtotal: 100,
      total: 100,
      createdBy: creatorUserId,
    },
  })
  await prisma.purchaseOrderItem.create({
    data: { purchaseOrderId: purchaseOrder.id, inventoryItemId: inventoryItem.id, quantity: 2, unitCost: 50 },
  })

  // Guest -> reservation -> folio
  const guest = await prisma.guest.create({
    data: {
      propertyId,
      firstName: `${side.toUpperCase()}`,
      lastName: 'ConfidentialGuest',
      email: `${side}@confidential.example`,
      phone: '+254700000999',
      idNumber: `${side.toUpperCase()}-ID-777`,
      isVip: true,
    },
  })

  const checkIn = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const checkOut = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  const reservation = await prisma.reservation.create({
    data: {
      propertyId,
      guestId: guest.id,
      roomTypeId,
      roomId,
      confirmationCode: `${side.toUpperCase()}-RES-0001`,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      adults: 2,
      rate: 120,
      status: 'CONFIRMED',
    },
  })

  const folio = await prisma.folio.create({
    data: {
      propertyId,
      guestId: guest.id,
      reservationId: reservation.id,
      folioNumber: `${side.toUpperCase()}-FOLIO-0001`,
      balance: 500,
      totalCharges: 500,
      status: 'OPEN',
    },
  })

  // POS order
  const order = await prisma.order.create({
    data: {
      outletId,
      orderNumber: `${side.toUpperCase()}-ORD-0001`,
      orderType: 'DINE_IN',
      customerName: `${side.toUpperCase()} Confidential Customer`,
      total: 250,
      balance: 250,
      status: 'OPEN',
      createdById: creatorUserId,
    },
  })
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: seed[side].productId,
      productName: 'seed product',
      productCode: 'seed-code',
      quantity: 1,
      unitPrice: 250,
      total: 250,
    },
  })

  // POS shift
  const shift = await prisma.shift.create({
    data: {
      outletId,
      terminalId,
      userId: creatorUserId,
      openingBalance: 1000,
      status: 'OPEN',
    },
  })

  // Housekeeping + maintenance
  const housekeepingTask = await prisma.housekeepingTask.create({
    data: {
      propertyId,
      roomId,
      type: 'TURNDOWN',
      status: 'PENDING',
      notes: `${side.toUpperCase()} confidential housekeeping note`,
    },
  })

  const maintenanceTicket = await prisma.maintenanceTicket.create({
    data: {
      propertyId,
      roomId,
      title: `${side.toUpperCase()} confidential ticket`,
      description: 'Confidential maintenance description',
      status: 'OPEN',
    },
  })

  const loyaltyAccount = await prisma.loyaltyAccount.create({
    data: { guestId: guest.id, points: 500, lifetimePoints: 500, tier: 'SILVER' },
  })

  return {
    organizationId,
    propertyId,
    outletId,
    roomTypeId,
    roomId,
    tableId,
    terminalId,
    menuId: seed[side].menuId,
    categoryId: seed[side].categoryId,
    productId: seed[side].productId,
    inventoryItemId: inventoryItem.id,
    guestId: guest.id,
    reservationId: reservation.id,
    folioId: folio.id,
    supplierId: supplier.id,
    purchaseOrderId: purchaseOrder.id,
    orderId: order.id,
    shiftId: shift.id,
    housekeepingTaskId: housekeepingTask.id,
    maintenanceTicketId: maintenanceTicket.id,
    loyaltyAccountId: loyaltyAccount.id,
  }
}

export async function setupSecurityFixtures(): Promise<SecurityFixture> {
  const seed = await setupTestDatabase()
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_TEST_URL } } })

  try {
    const roleIdsA: Record<string, string> = {}
    for (const role of await prisma.appRole.findMany({ where: { organizationId: seed.orgA.organizationId } })) {
      roleIdsA[role.name] = role.id
    }
    const roleIdsB: Record<string, string> = {}
    for (const role of await prisma.appRole.findMany({ where: { organizationId: seed.orgB.organizationId } })) {
      roleIdsB[role.name] = role.id
    }

    const restrictedA = await createExtraUser(prisma, seed.orgA.organizationId, roleIdsA.CUSTOMER, 'restricted.a@testorga.com')
    const restrictedB = await createExtraUser(prisma, seed.orgB.organizationId, roleIdsB.CUSTOMER, 'restricted.b@testorgb.com')
    const housekeeper = await createExtraUser(prisma, seed.orgA.organizationId, roleIdsA.HOUSEKEEPER, 'housekeeper.a@testorga.com')
    const storekeeper = await createExtraUser(prisma, seed.orgA.organizationId, roleIdsA.STOREKEEPER, 'storekeeper.a@testorga.com')
    const accountant = await createExtraUser(prisma, seed.orgA.organizationId, roleIdsA.ACCOUNTANT, 'accountant.a@testorga.com')
    const auditor = await createExtraUser(prisma, seed.orgA.organizationId, roleIdsA.AUDITOR, 'auditor.a@testorga.com')

    const users = {
      adminA: seed.orgA.users.ORG_ADMIN.id,
      adminB: seed.orgB.users.ORG_ADMIN.id,
      superAdminA: seed.orgA.users.SUPER_ADMIN.id,
      superAdminB: seed.orgB.users.SUPER_ADMIN.id,
      receptionistA: seed.orgA.users.RECEPTIONIST.id,
      cashierA: seed.orgA.users.CASHIER.id,
      chefA: seed.orgA.users.CHEF.id,
      waiterA: seed.orgA.users.WAITER.id,
      housekeeperA: housekeeper.id,
      storekeeperA: storekeeper.id,
      accountantA: accountant.id,
      auditorA: auditor.id,
      restrictedA: restrictedA.id,
      restrictedB: restrictedB.id,
    }

    const orgA = await buildTenant(prisma, seed, 'orgA', roleIdsA, users.adminA)
    const orgB = await buildTenant(prisma, seed, 'orgB', roleIdsB, users.adminB)

    const passwords = {
      adminA: seed.orgA.users.ORG_ADMIN.password,
      adminB: seed.orgB.users.ORG_ADMIN.password,
      superAdminA: seed.orgA.users.SUPER_ADMIN.password,
      superAdminB: seed.orgB.users.SUPER_ADMIN.password,
      receptionistA: seed.orgA.users.RECEPTIONIST.password,
      cashierA: seed.orgA.users.CASHIER.password,
      chefA: seed.orgA.users.CHEF.password,
      waiterA: seed.orgA.users.WAITER.password,
      housekeeperA: PASSWORD,
      storekeeperA: PASSWORD,
      accountantA: PASSWORD,
      auditorA: PASSWORD,
      restrictedA: PASSWORD,
      restrictedB: PASSWORD,
    }

    const emails = {
      adminA: seed.orgA.users.ORG_ADMIN.email,
      adminB: seed.orgB.users.ORG_ADMIN.email,
      superAdminA: seed.orgA.users.SUPER_ADMIN.email,
      superAdminB: seed.orgB.users.SUPER_ADMIN.email,
      receptionistA: seed.orgA.users.RECEPTIONIST.email,
      cashierA: seed.orgA.users.CASHIER.email,
      chefA: seed.orgA.users.CHEF.email,
      waiterA: seed.orgA.users.WAITER.email,
      housekeeperA: 'housekeeper.a@testorga.com',
      storekeeperA: 'storekeeper.a@testorga.com',
      accountantA: 'accountant.a@testorga.com',
      auditorA: 'auditor.a@testorga.com',
      restrictedA: 'restricted.a@testorga.com',
      restrictedB: 'restricted.b@testorgb.com',
    }

    return {
      orgA,
      orgB,
      users,
      emails,
      passwords,
      roleIds: { orgA: roleIdsA, orgB: roleIdsB },
      seed,
    }
  } finally {
    await prisma.$disconnect()
  }
}
