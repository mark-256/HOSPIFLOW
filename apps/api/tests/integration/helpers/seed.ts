import { PrismaClient } from '@hospiflow/database'
import bcrypt from 'bcrypt'

export interface SeedData {
  orgA: {
    organizationId: string
    propertyId: string
    outletId: string
    roomTypeId: string
    room1Id: string
    room2Id: string
    tableId: string
    terminalId: string
    menuId: string
    categoryId: string
    productId: string
    recipeId: string
    inventoryItemId: string
    taxRuleId: string
    ratePlanId: string
    users: Record<string, { id: string; email: string; password: string; roleId: string }>
  }
  orgB: {
    organizationId: string
    propertyId: string
    outletId: string
    roomTypeId: string
    room1Id: string
    tableId: string
    terminalId: string
    menuId: string
    categoryId: string
    productId: string
    taxRuleId: string
    users: Record<string, { id: string; email: string; password: string; roleId: string }>
  }
  adminUserA: string
  superAdminUserA: string
}

const ALL_PERMISSIONS: string[] = [
  'orders_create', 'orders_view', 'orders_edit', 'orders_cancel', 'orders_discount',
  'payments_process', 'payments_refund',
  'inventory_view', 'inventory_adjust',
  'reports_view', 'users_manage',
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
]

function rolePerms(role: string): string[] {
  switch (role) {
    case 'SUPER_ADMIN': return ALL_PERMISSIONS
    case 'ORG_ADMIN': return ALL_PERMISSIONS
    case 'GENERAL_MANAGER': return ALL_PERMISSIONS
    case 'FRONT_OFFICE_MANAGER':
      return ['reservations_create', 'reservations_edit', 'guests_view', 'guests_edit', 'folios_view', 'folios_edit', 'rooms_view', 'orders_create', 'orders_view', 'orders_edit']
    case 'RECEPTIONIST':
      return ['guests_view', 'reservations_create', 'reservations_edit', 'folios_view', 'folios_edit', 'rooms_view', 'orders_create']
    case 'RESTAURANT_MANAGER':
      return ['orders_create', 'orders_view', 'orders_edit', 'orders_cancel', 'orders_discount', 'payments_process', 'payments_refund', 'shifts_view', 'shifts_manage', 'menu_manage']
    case 'CASHIER':
      return ['orders_create', 'orders_view', 'orders_edit', 'payments_process', 'payments_refund', 'shifts_view']
    case 'WAITER':
      return ['orders_create', 'orders_view', 'orders_edit']
    case 'CHEF':
      return ['orders_view', 'orders_edit', 'orders_cancel']
    case 'KITCHEN_STAFF':
      return ['orders_view', 'orders_edit']
    case 'HOUSEKEEPER':
      return ['housekeeping_view', 'housekeeping_edit']
    case 'STOREKEEPER':
      return ['inventory_view', 'inventory_adjust']
    case 'PROCUREMENT_OFFICER':
      return ['inventory_view', 'procurement_view', 'procurement_edit']
    case 'ACCOUNTANT':
      return ['finance_view', 'reports_view']
    case 'AUDITOR':
      return ['reports_view', 'finance_view']
    default: return []
  }
}

function createUser(prisma: PrismaClient, orgId: string, roleId: string, roleName: string, email: string, password: string, firstName: string, lastName: string) {
  const passwordHash = bcrypt.hashSync(password, 10)
  return prisma.user.create({
    data: {
      organizationId: orgId,
      roleId,
      email,
      passwordHash,
      firstName,
      lastName,
      isActive: true,
    },
  })
}

function createRole(prisma: PrismaClient, orgId: string, roleName: string) {
  return prisma.appRole.create({
    data: {
      organizationId: orgId,
      name: roleName,
      description: `${roleName} role`,
      isSystem: true,
      permissions: rolePerms(roleName) as any,
    },
  })
}

export async function seedTestData(prisma: PrismaClient): Promise<SeedData> {
  // Create Organizations
  const orgA = await prisma.organization.create({
    data: { name: 'Test Hotel Group A', slug: 'test-org-a', status: 'ACTIVE' },
  })
  const orgB = await prisma.organization.create({
    data: { name: 'Test Hotel Group B', slug: 'test-org-b', status: 'ACTIVE' },
  })

  // Create Properties
  const propA = await prisma.property.create({
    data: {
      organizationId: orgA.id,
      name: 'Grand Plaza Hotel',
      code: 'GPH',
      city: 'Nairobi',
      country: 'Kenya',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      status: 'ACTIVE',
    },
  })
  const propB = await prisma.property.create({
    data: {
      organizationId: orgB.id,
      name: 'Oceanview Resort',
      code: 'OVR',
      city: 'Mombasa',
      country: 'Kenya',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      status: 'ACTIVE',
    },
  })

  // Create Outlets
  const outletA = await prisma.outlet.create({
    data: {
      propertyId: propA.id,
      name: 'Main Restaurant',
      code: 'MAIN-RESTAURANT',
      type: 'RESTAURANT',
      status: 'ACTIVE',
    },
  })
  const outletB = await prisma.outlet.create({
    data: {
      propertyId: propB.id,
      name: 'Pool Bar',
      code: 'POOL-BAR',
      type: 'BAR',
      status: 'ACTIVE',
    },
  })

  // Create Room Types and Rooms for Org A
  const roomTypeA = await prisma.roomType.create({
    data: {
      propertyId: propA.id,
      name: 'Deluxe King',
      code: 'DK',
      description: 'Deluxe King Room',
      maxAdults: 2,
      maxChildren: 1,
      bedType: 'King',
      amenities: ['wifi', 'tv'],
      basePrice: 120.0,
      status: 'ACTIVE',
    },
  })
  const room1A = await prisma.room.create({
    data: { propertyId: propA.id, roomTypeId: roomTypeA.id, roomNumber: '101', status: 'AVAILABLE' },
  })
  const room2A = await prisma.room.create({
    data: { propertyId: propA.id, roomTypeId: roomTypeA.id, roomNumber: '102', status: 'AVAILABLE' },
  })

  // Create Room Types and Rooms for Org B
  const roomTypeB = await prisma.roomType.create({
    data: {
      propertyId: propB.id,
      name: 'Ocean Suite',
      code: 'OS',
      description: 'Ocean Suite',
      maxAdults: 4,
      maxChildren: 2,
      bedType: 'Queen',
      amenities: ['wifi', 'tv', 'balcony'],
      basePrice: 200.0,
      status: 'ACTIVE',
    },
  })
  const room1B = await prisma.room.create({
    data: { propertyId: propB.id, roomTypeId: roomTypeB.id, roomNumber: '201', status: 'AVAILABLE' },
  })

  // Create Tables
  const tableA = await prisma.table.create({
    data: {
      propertyId: propA.id,
      outletId: outletA.id,
      name: 'Table 1',
      code: 'T1',
      capacity: 4,
      positionX: 10,
      positionY: 10,
      status: 'AVAILABLE',
    },
  })
  const tableB = await prisma.table.create({
    data: {
      propertyId: propB.id,
      outletId: outletB.id,
      name: 'Bar Table 1',
      code: 'BT1',
      capacity: 2,
      positionX: 5,
      positionY: 5,
      status: 'AVAILABLE',
    },
  })

  // Create Terminals
  const terminalA = await prisma.terminal.create({
    data: { outletId: outletA.id, name: 'Terminal 1', code: 'T1', status: 'ACTIVE' },
  })
  const terminalB = await prisma.terminal.create({
    data: { outletId: outletB.id, name: 'Terminal 1', code: 'T1', status: 'ACTIVE' },
  })

  // Create Roles for Org A
  const rolesA: Record<string, any> = {}
  for (const roleName of ['SUPER_ADMIN', 'ORG_ADMIN', 'GENERAL_MANAGER', 'FRONT_OFFICE_MANAGER', 'RECEPTIONIST', 'RESTAURANT_MANAGER', 'CASHIER', 'WAITER', 'CHEF', 'KITCHEN_STAFF', 'HOUSEKEEPER', 'STOREKEEPER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT', 'AUDITOR', 'CUSTOMER']) {
    rolesA[roleName] = await createRole(prisma, orgA.id, roleName)
  }

  // Create Roles for Org B (same set)
  const rolesB: Record<string, any> = {}
  for (const roleName of ['SUPER_ADMIN', 'ORG_ADMIN', 'GENERAL_MANAGER', 'FRONT_OFFICE_MANAGER', 'RECEPTIONIST', 'RESTAURANT_MANAGER', 'CASHIER', 'WAITER', 'CHEF', 'KITCHEN_STAFF', 'HOUSEKEEPER', 'STOREKEEPER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT', 'AUDITOR', 'CUSTOMER']) {
    rolesB[roleName] = await createRole(prisma, orgB.id, roleName)
  }

  // Create Users for Org A
  const usersA: Record<string, { id: string; email: string; password: string; roleId: string }> = {}
  const userConfigsA = [
    { role: 'SUPER_ADMIN', email: 'superadmin@testorga.com', pass: 'Admin@123!', first: 'Super', last: 'Admin' },
    { role: 'ORG_ADMIN', email: 'admin@testorga.com', pass: 'Admin@123!', first: 'Admin', last: 'UserA' },
    { role: 'RECEPTIONIST', email: 'receptionist@testorga.com', pass: 'Recep@123!', first: 'Reception', last: 'UserA' },
    { role: 'CASHIER', email: 'cashier@testorga.com', pass: 'Cashier@123!', first: 'Cashier', last: 'UserA' },
    { role: 'WAITER', email: 'waiter@testorga.com', pass: 'Waiter@123!', first: 'Waiter', last: 'UserA' },
    { role: 'CHEF', email: 'chef@testorga.com', pass: 'Chef@123!', first: 'Chef', last: 'UserA' },
  ]
  for (const cfg of userConfigsA) {
    const user = await createUser(prisma, orgA.id, rolesA[cfg.role].id, cfg.role, cfg.email, cfg.pass, cfg.first, cfg.last)
    usersA[cfg.role] = { id: user.id, email: user.email, password: cfg.pass, roleId: user.roleId }
  }

  // Create Users for Org B
  const usersB: Record<string, { id: string; email: string; password: string; roleId: string }> = {}
  const userConfigsB = [
    { role: 'SUPER_ADMIN', email: 'superadmin@testorgb.com', pass: 'Admin@123!', first: 'Super', last: 'AdminB' },
    { role: 'ORG_ADMIN', email: 'admin@testorgb.com', pass: 'Admin@123!', first: 'Admin', last: 'UserB' },
    { role: 'RECEPTIONIST', email: 'receptionist@testorgb.com', pass: 'Recep@123!', first: 'Reception', last: 'UserB' },
  ]
  for (const cfg of userConfigsB) {
    const user = await createUser(prisma, orgB.id, rolesB[cfg.role].id, cfg.role, cfg.email, cfg.pass, cfg.first, cfg.last)
    usersB[cfg.role] = { id: user.id, email: user.email, password: cfg.pass, roleId: user.roleId }
  }

  // Create Rate Plans for Org A
  const ratePlanA = await prisma.ratePlan.create({
    data: {
      propertyId: propA.id,
      roomTypeId: roomTypeA.id,
      name: 'Standard Rate',
      code: 'STD',
      price: 120.0,
      startDate: new Date(),
      isActive: true,
    },
  })

  // Create Inventory Items for Org A
  const inventoryItemA = await prisma.inventoryItem.create({
    data: {
      organizationId: orgA.id,
      name: 'Beef Patty',
      sku: 'ING-BEEF-001',
      description: 'Ground beef patty',
      category: 'Meat',
      unit: 'kg',
      unitCost: 12.5,
      reorderLevel: 5.0,
      minStockLevel: 2.0,
      maxStockLevel: 50.0,
      isActive: true,
    },
  })
  const inventoryItemBun = await prisma.inventoryItem.create({
    data: {
      organizationId: orgA.id,
      name: 'Burger Bun',
      sku: 'ING-BUN-001',
      description: 'Burger buns',
      category: 'Bakery',
      unit: 'pcs',
      unitCost: 0.5,
      reorderLevel: 50,
      minStockLevel: 20,
      maxStockLevel: 500,
      isActive: true,
    },
  })
  const inventoryItemCheese = await prisma.inventoryItem.create({
    data: {
      organizationId: orgA.id,
      name: 'Cheese Slice',
      sku: 'ING-CHEESE-001',
      description: 'Cheese slices',
      category: 'Dairy',
      unit: 'pcs',
      unitCost: 0.3,
      reorderLevel: 100,
      minStockLevel: 50,
      maxStockLevel: 1000,
      isActive: true,
    },
  })

  // Add initial stock
  await prisma.stockMovement.createMany({
    data: [
      { inventoryItemId: inventoryItemA.id, type: 'PURCHASE', quantity: 50, unitCost: 12.5, reference: 'initial-stock' },
      { inventoryItemId: inventoryItemBun.id, type: 'PURCHASE', quantity: 500, unitCost: 0.5, reference: 'initial-stock' },
      { inventoryItemId: inventoryItemCheese.id, type: 'PURCHASE', quantity: 1000, unitCost: 0.3, reference: 'initial-stock' },
    ],
  })

  // Create Menus and Menu Categories for Org A
  const menuA = await prisma.menu.create({
    data: {
      outletId: outletA.id,
      name: 'Main Menu',
      code: 'MM',
      description: 'Main menu',
      isActive: true,
    },
  })
  const categoryA = await prisma.menuCategory.create({
    data: {
      menuId: menuA.id,
      name: 'Burgers',
      code: 'BURGERS',
      description: 'Burger selections',
      sortOrder: 1,
      isActive: true,
    },
  })

  // Create Products for Org A
  const productBurger = await prisma.product.create({
    data: {
      menuCategoryId: categoryA.id,
      name: 'Classic Burger',
      code: 'BURG-001',
      description: 'Beef burger with lettuce, tomato, cheese',
      price: 12.50,
      cost: 5.0,
      isAvailable: true,
      isActive: true,
      sortOrder: 1,
      station: 'KITCHEN',
      tags: ['popular'],
    },
  })

  const productFries = await prisma.product.create({
    data: {
      menuCategoryId: categoryA.id,
      name: 'French Fries',
      code: 'FRY-001',
      description: 'Crispy french fries',
      price: 4.50,
      cost: 1.0,
      isAvailable: true,
      isActive: true,
      sortOrder: 2,
      station: 'KITCHEN',
      tags: ['sides'],
    },
  })

  // Create Modifier Group and Modifiers
  const modifierGroupA = await prisma.modifierGroup.create({
    data: {
      menuCategoryId: categoryA.id,
      name: 'Extra Toppings',
      code: 'EXTRA-TOP',
      isRequired: false,
      minSelect: 0,
      maxSelect: 3,
      sortOrder: 1,
    },
  })

  const modifierCheese = await prisma.modifier.create({
    data: {
      modifierGroupId: modifierGroupA.id,
      productId: productBurger.id,
      name: 'Extra Cheese',
      code: 'EXTRA-CHEESE',
      price: 1.50,
      sortOrder: 1,
    },
  })

  const modifierBacon = await prisma.modifier.create({
    data: {
      modifierGroupId: modifierGroupA.id,
      productId: productBurger.id,
      name: 'Extra Bacon',
      code: 'EXTRA-BACON',
      price: 2.50,
      sortOrder: 2,
    },
  })

  // Create Recipe for the burger
  const recipeA = await prisma.recipe.create({
    data: {
      productId: productBurger.id,
      description: 'Classic burger recipe',
      instructions: 'Grill patty, assemble with bun, cheese, lettuce, tomato',
    },
  })

  await prisma.recipeIngredient.createMany({
    data: [
      { recipeId: recipeA.id, productId: productBurger.id, inventoryItemId: inventoryItemA.id, quantity: 0.15, unit: 'kg' },
      { recipeId: recipeA.id, productId: productBurger.id, inventoryItemId: inventoryItemBun.id, quantity: 1, unit: 'pcs' },
      { recipeId: recipeA.id, productId: productBurger.id, inventoryItemId: inventoryItemCheese.id, quantity: 2, unit: 'pcs' },
    ],
  })

  // Create Tax Rules for Org A
  const taxRuleVatA = await prisma.taxRule.create({
    data: {
      organizationId: orgA.id,
      name: 'VAT',
      type: 'VAT',
      rate: 0.16,
      isActive: true,
      applicableTo: [],
    },
  })
  const taxRuleServiceA = await prisma.taxRule.create({
    data: {
      organizationId: orgA.id,
      name: 'Service Charge',
      type: 'SERVICE_CHARGE',
      rate: 0.10,
      isActive: true,
      applicableTo: [],
    },
  })

  // Create a Guest for Org A
  const guestA = await prisma.guest.create({
    data: {
      propertyId: propA.id,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+254700000001',
      nationality: 'Kenyan',
      idNumber: 'ID123456',
      idType: 'PASSPORT',
      address: '123 Test Street',
      city: 'Nairobi',
      country: 'Kenya',
      isVip: false,
    },
  })

  // Create Guest for Org B
  const guestB = await prisma.guest.create({
    data: {
      propertyId: propB.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+254700000002',
      nationality: 'British',
      idNumber: 'ID789012',
      idType: 'PASSPORT',
      address: '456 Test Avenue',
      city: 'Mombasa',
      country: 'Kenya',
      isVip: false,
    },
  })

  // Create Menus and Menus for Org B
  const menuB = await prisma.menu.create({
    data: {
      outletId: outletB.id,
      name: 'Bar Menu',
      code: 'BAR',
      description: 'Bar menu',
      isActive: true,
    },
  })
  const categoryB = await prisma.menuCategory.create({
    data: {
      menuId: menuB.id,
      name: 'Cocktails',
      code: 'COCKTAILS',
      description: 'Cocktail selections',
      sortOrder: 1,
      isActive: true,
    },
  })
  const productB = await prisma.product.create({
    data: {
      menuCategoryId: categoryB.id,
      name: 'Mojito',
      code: 'MOJ-001',
      description: 'Classic mojito',
      price: 8.50,
      cost: 3.0,
      isAvailable: true,
      isActive: true,
      sortOrder: 1,
      station: 'BAR',
      tags: ['popular'],
    },
  })

  // Create Tax Rules for Org B
  const taxRuleVatB = await prisma.taxRule.create({
    data: {
      organizationId: orgB.id,
      name: 'VAT',
      type: 'VAT',
      rate: 0.16,
      isActive: true,
      applicableTo: [],
    },
  })

  return {
    orgA: {
      organizationId: orgA.id,
      propertyId: propA.id,
      outletId: outletA.id,
      roomTypeId: roomTypeA.id,
      room1Id: room1A.id,
      room2Id: room2A.id,
      tableId: tableA.id,
      terminalId: terminalA.id,
      menuId: menuA.id,
      categoryId: categoryA.id,
      productId: productBurger.id,
      recipeId: recipeA.id,
      inventoryItemId: inventoryItemA.id,
      taxRuleId: taxRuleVatA.id,
      ratePlanId: ratePlanA.id,
      users: usersA,
    },
    orgB: {
      organizationId: orgB.id,
      propertyId: propB.id,
      outletId: outletB.id,
      roomTypeId: roomTypeB.id,
      room1Id: room1B.id,
      tableId: tableB.id,
      terminalId: terminalB.id,
      menuId: menuB.id,
      categoryId: categoryB.id,
      productId: productB.id,
      taxRuleId: taxRuleVatB.id,
      users: usersB,
    },
    adminUserA: usersA['ORG_ADMIN'].id,
    superAdminUserA: usersA['SUPER_ADMIN'].id,
  }
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`

  for (const { tablename } of tablenames) {
    if (tablename.startsWith('_prisma')) continue
    const escaped = tablename.replace(/"/g, '""')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${escaped}" CASCADE`)
  }

  await prisma.$executeRawUnsafe('SELECT setval(pg_get_serial_sequence(\'organization\', \'id\'), 1, false)')
}
