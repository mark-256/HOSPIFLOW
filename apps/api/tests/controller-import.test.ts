import { it, expect } from 'vitest'
import { ordersController } from '../src/controllers/ordersController'
import { foliosController } from '../src/controllers/foliosController'
import { reservationsController } from '../src/controllers/reservationsController'
import { authController } from '../src/controllers/authController'
import { guestsController } from '../src/controllers/guestsController'
import { inventoryController } from '../src/controllers/inventoryController'
import { loyaltyController } from '../src/controllers/loyaltyController'
import { shiftsController } from '../src/controllers/shiftsController'
import { reportsController } from '../src/controllers/reportsController'

it('loads all controllers without transformer errors', () => {
  expect(ordersController).toBeDefined()
  expect(foliosController).toBeDefined()
  expect(reservationsController).toBeDefined()
  expect(authController).toBeDefined()
  expect(guestsController).toBeDefined()
  expect(inventoryController).toBeDefined()
  expect(loyaltyController).toBeDefined()
  expect(shiftsController).toBeDefined()
  expect(reportsController).toBeDefined()
})
