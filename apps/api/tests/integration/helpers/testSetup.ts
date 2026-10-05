/**
 * Vitest global setup for HOSPIFLOW integration tests.
 *
 * This file runs before any test file. It enforces that the test suite
 * uses a genuinely isolated test database — never the development database.
 *
 * Strategy:
 * 1. Capture the original DATABASE_URL (dev DB) from the shell environment.
 * 2. Validate DATABASE_TEST_URL is set and points to a different database.
 * 3. Only then override DATABASE_URL to point at the test database so the
 *    application's own Prisma clients use the test database during tests.
 */
import { TEST_DB_URL, assertTestDbIsolated } from './testEnv'

// Capture the original dev DATABASE_URL before we override it
const originalDevDbUrl = process.env.DATABASE_URL

if (!TEST_DB_URL) {
  console.error(`
TEST DATABASE CONFIGURATION ERROR:
DATABASE_TEST_URL is not configured.
Refusing to run destructive integration tests against DATABASE_URL.

Set DATABASE_TEST_URL to a dedicated test database:
  export DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"
`)
  process.exit(1)
}

// Enforce isolation: test DB must not be the same as the dev DB
assertTestDbIsolated(originalDevDbUrl)

// Override DATABASE_URL so the application (imported by test files) uses the
// test database, not the development database.
process.env.DATABASE_URL = TEST_DB_URL

if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'test'
}

console.log('[B38] Test database isolation verified — using:', TEST_DB_URL)
