const TEST_DB_URL = 'postgresql://hospiflow:hospiflow_dev@localhost:5433/hospiflow_test'

export { TEST_DB_URL }

export function setTestEnv(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test database can only be used when NODE_ENV=test')
  }
  process.env.DATABASE_URL = TEST_DB_URL
  process.env.DATABASE_TEST_URL = TEST_DB_URL
  process.env.PAYMENT_PROVIDER = 'mock'
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-integration-tests-only'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-integration-tests-only'
  process.env.JWT_EXPIRY = '15m'
  process.env.JWT_REFRESH_EXPIRY = '7d'
  process.env.REDIS_URL = 'redis://localhost:6379'
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
