import { it, expect } from 'vitest'
import express from 'express'

it('express loads', () => {
  const app = express()
  expect(app).toBeDefined()
})
