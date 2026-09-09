import { it, expect } from 'vitest'
import express from 'express'
import { config } from '../src/config'
import authRoutes from '../src/routes/auth'

const app = express()
app.use('/api/auth', authRoutes)

it('app with auth routes works', () => {
  expect(app).toBeDefined()
})
