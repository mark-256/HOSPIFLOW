# Production Configuration

## Environment Variables Required

### Database
- DATABASE_URL: PostgreSQL connection string
- NODE_ENV: production, development, or test

### JWT
- JWT_SECRET: Secret key for access token signing
- JWT_REFRESH_SECRET: Secret key for refresh token signing
- JWT_EXPIRY: Access token expiry (default: 15m)
- JWT_REFRESH_EXPIRY: Refresh token expiry (default: 7d)

### Payment
- PAYMENT_PROVIDER: MPESA, STRIPE, or MOCK (MOCK NOT ALLOWED in production)
- MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_PASSKEY, MPESA_SHORTCODE: M-Pesa sandbox credentials
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: Stripe credentials

### Redis
- REDIS_URL: Redis connection string
- REDIS_PASSWORD: Redis password (if applicable)

### Application
- PORT: API port (default: 3001)
- APP_URL: Frontend URL
- FRONTEND_URL: Frontend URL
- BACKEND_URL: Backend URL

### Rate Limiting
- RATE_LIMIT_WINDOW_MS: Window in ms (default: 900000)
- RATE_LIMIT_MAX: Max requests per window (default: 100)

### Backup
- BACKUP_DIR: Backup directory path
- BACKUP_RETENTION_DAYS: Days to retain backups
- BACKUP_SCHEDULE: Cron expression for scheduled backups

## Production Deployment

### Docker Compose
```bash
docker compose -f docker-compose.production.yml up -d
```

### Prerequisites
1. Set all environment variables in `.env` file
2. Run `npx prisma migrate deploy`
3. Run `npm run db:seed` (if needed)
4. Ensure PostgreSQL and Redis are running

### Fail-Closed Behavior
- MOCK payment provider is NOT ALLOWED in production (enforced by PaymentProviderFactory)
- Missing payment credentials cause application startup failure
- Invalid configuration is rejected at startup, not runtime
