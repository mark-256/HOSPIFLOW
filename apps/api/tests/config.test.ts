import { it, expect } from 'vitest'
import { config } from '../src/config'

it('config loads', () => {
  expect(config.port).toBeGreaterThan(0)
})
