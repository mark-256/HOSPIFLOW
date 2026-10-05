function getTestDbUrl(): string {
  const url = process.env.DATABASE_TEST_URL

  if (!url) {
    console.error(`
TEST DATABASE CONFIGURATION ERROR:
DATABASE_TEST_URL is not configured.
Refusing to run destructive integration tests against DATABASE_URL.

To fix this, set DATABASE_TEST_URL to a dedicated test database, e.g.:
  DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"

Then run:
  scripts/setup-test-db.sh
`)
    throw new Error(
      'DATABASE_TEST_URL is not configured. Refusing to run integration tests against the development database.'
    )
  }

  return url
}

const TEST_DB_URL = getTestDbUrl()

function parseDbName(url: string): string | null {
  try {
    const u = new URL(url.replace(/^postgres/, 'postgresql'))
    return u.pathname.replace(/^\//, '') || null
  } catch {
    return null
  }
}

function parseDbHost(url: string): string | null {
  try {
    const u = new URL(url.replace(/^postgres/, 'postgresql'))
    return u.hostname || null
  } catch {
    return null
  }
}

function parseDbPort(url: string): number | null {
  try {
    const u = new URL(url.replace(/^postgres/, 'postgresql'))
    return u.port ? parseInt(u.port, 10) : null
  } catch {
    return null
  }
}

export function assertTestDbIsolated(devDbUrl: string | undefined): void {
  const testName = parseDbName(TEST_DB_URL)
  if (!testName) return

  // Always reject the known development/production database name
  if (testName === 'hospiflow') {
    console.error(`
TEST DATABASE CONFIGURATION ERROR:
DATABASE_TEST_URL resolves to the 'hospiflow' database.

DATABASE_TEST_URL: ${TEST_DB_URL}

The test database must be physically separate from the development database.
The database name 'hospiflow' is used by the normal development and production
environments. Refusing to run destructive tests against it.

Use a dedicated test database name (e.g. 'hospiflow_test'):
  DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"
`)
    throw new Error(
      'DATABASE_TEST_URL must point to a database separate from the development database.'
    )
  }

  if (devDbUrl) {
    const devName = parseDbName(devDbUrl)
    const devHost = parseDbHost(devDbUrl)
    const testHost = parseDbHost(TEST_DB_URL)
    const devPort = parseDbPort(devDbUrl)
    const testPort = parseDbPort(TEST_DB_URL)

    const sameDb =
      testName === devName &&
      testHost === devHost &&
      (devPort === testPort || testPort === null || devPort === null)

    if (sameDb) {
      console.error(`
TEST DATABASE CONFIGURATION ERROR:
DATABASE_TEST_URL points to the same database as DATABASE_URL.

DATABASE_URL:      ${devDbUrl}
DATABASE_TEST_URL: ${TEST_DB_URL}

The test database must be physically separate from the development database.
Refusing to start tests that could destroy development data.

Create a separate test database, e.g.:
  createdb -h localhost -U hospiflow hospiflow_test
  DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"
`)
      throw new Error(
        'DATABASE_TEST_URL must point to a database separate from DATABASE_URL.'
      )
    }
  }
}

export { TEST_DB_URL }

export function setTestEnv(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test database can only be used when NODE_ENV=test')
  }
  const originalDevDbUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = TEST_DB_URL
  process.env.DATABASE_TEST_URL = TEST_DB_URL
  assertTestDbIsolated(originalDevDbUrl)
  process.env.PAYMENT_PROVIDER = 'mock'
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-integration-tests-only'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-integration-tests-only'
  process.env.JWT_EXPIRY = '15m'
  process.env.JWT_REFRESH_EXPIRY = '7d'
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
  process.env.AUTH_RATE_LIMIT_WINDOW_MS = '900000'
  process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '100000'
  process.env.APP_URL = 'http://localhost:3001'
  process.env.FRONTEND_URL = 'http://localhost:3001'
  process.env.BACKEND_URL = 'http://localhost:3001'
  process.env.MPESA_ENVIRONMENT = 'sandbox'
  process.env.MPESA_SHORTCODE = '174379'
  process.env.MPESA_CONSUMER_KEY = ''
  process.env.MPESA_CONSUMER_SECRET = ''
  process.env.MPESA_PASSKEY = ''
  process.env.STRIPE_SECRET_KEY = ''
  process.env.STRIPE_WEBHOOK_SECRET = ''
  process.env.UPLOAD_DIR = '/tmp/hospiflow-uploads'
  process.env.BACKUP_DIR = '/tmp/hospiflow-backups'
  process.env.BACKUP_RETENTION_DAYS = '7'
  process.env.MPESA_CONSUMER_KEY = ''
}
