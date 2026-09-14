import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow',
      DATABASE_TEST_URL: 'postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow',
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'mock',
      JWT_SECRET: 'test-jwt-secret-key-for-integration-tests-only',
      JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-integration-tests-only',
      JWT_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      REDIS_URL: 'redis://localhost:6379',
      APP_URL: 'http://localhost:3001',
      FRONTEND_URL: 'http://localhost:3001',
      BACKEND_URL: 'http://localhost:3001',
      MPESA_ENVIRONMENT: 'sandbox',
      MPESA_SHORTCODE: '174379',
      MPESA_CONSUMER_KEY: '',
      MPESA_CONSUMER_SECRET: '',
      MPESA_PASSKEY: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      UPLOAD_DIR: '/tmp/hospiflow-uploads',
      BACKUP_DIR: '/tmp/hospiflow-backups',
      BACKUP_RETENTION_DAYS: '7',
    },
    fileParallelism: false,
    testTimeout: 30000,
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
})
