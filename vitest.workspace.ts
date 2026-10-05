const testDbUrl = process.env.DATABASE_TEST_URL

if (!testDbUrl) {
  console.error(`
TEST DATABASE CONFIGURATION ERROR:
DATABASE_TEST_URL is not configured.
Refusing to run destructive integration tests against DATABASE_URL.

Set DATABASE_TEST_URL to a dedicated test database, e.g.:
  export DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"

Then initialize the test database:
  scripts/setup-test-db.sh
`)
  process.exit(1)
}

export default [
  {
    test: {
      name: 'integration',
      globals: true,
      environment: 'node',
      include: ['apps/api/tests/**/*.test.ts'],
      setupFiles: ['./apps/api/tests/integration/helpers/testSetup.ts'],
      env: {
        DATABASE_TEST_URL: testDbUrl,
        NODE_ENV: 'test',
        RATE_LIMIT_WINDOW_MS: '900000',
        RATE_LIMIT_MAX: '100000',
        AUTH_RATE_LIMIT_WINDOW_MS: '900000',
        AUTH_RATE_LIMIT_MAX: '100000',
        PAYMENT_PROVIDER: 'mock',
        JWT_SECRET: 'test-jwt-secret-key-for-integration-tests-only',
        JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-integration-tests-only',
        JWT_EXPIRY: '15m',
        JWT_REFRESH_EXPIRY: '7d',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        APP_URL: 'http://localhost:3001',
        FRONTEND_URL: 'http://localhost:3001',
        BACKEND_URL: 'http://localhost:3001',
        MPESA_ENVIRONMENT: 'sandbox',
        MPESA_SHORTCODE: '174379',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        MPESA_CONSUMER_KEY: '',
        MPESA_CONSUMER_SECRET: '',
        MPESA_PASSKEY: '',
        UPLOAD_DIR: '/tmp/hospiflow-uploads',
        BACKUP_DIR: '/tmp/hospiflow-backups',
        BACKUP_RETENTION_DAYS: '7',
      },
      fileParallelism: false,
    },
    resolve: {
      alias: {
        '@hospiflow/database': '/home/mark/development/myprojects/HOSPIFLOW/packages/database/src/index.ts',
        '@hospiflow/types': '/home/mark/development/myprojects/HOSPIFLOW/packages/types/src/index.ts',
      },
    },
    ssr: {
      noExternal: ['@hospiflow/database'],
    },
  },
]
