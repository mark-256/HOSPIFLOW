# Production Configuration

## Environment Variables Required

### Database
- `DATABASE_URL`: PostgreSQL connection string (MUST set in production)
- `NODE_ENV`: Must be `production` in production (default: development)

### JWT
- `JWT_SECRET`: Secret key for access token signing (MUST be long and random in production)
- `JWT_REFRESH_SECRET`: Secret key for refresh token signing (MUST be long and random in production)
- `JWT_EXPIRY`: Access token expiry (default: 15m)
- `JWT_REFRESH_EXPIRY`: Refresh token expiry (default: 7d)

### Payment
- `PAYMENT_PROVIDER`: MPESA, STRIPE, or MOCK (MOCK NOT ALLOWED in production — fail-closed)
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`: M-Pesa credentials (required in production if MPESA provider)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe credentials (required in production if STRIPE provider)

### Redis
- `REDIS_URL`: Redis connection string (MUST set in production)
- `REDIS_PASSWORD`: Redis password (if applicable)

### Application
- `PORT`: API port (default: 3001)
- `APP_URL`: Frontend URL
- `FRONTEND_URL`: Frontend URL
- `BACKEND_URL`: Backend URL

### Rate Limiting
- `RATE_LIMIT_WINDOW_MS`: Window in ms (default: 900000)
- `RATE_LIMIT_MAX`: Max requests per window (default: 100)

### Backup
- `BACKUP_DIR`: Backup directory path
- `BACKUP_RETENTION_DAYS`: Days to retain backups
- `BACKUP_SCHEDULE`: Cron expression for scheduled backups

## Production Deployment

### Docker Compose
```bash
docker-compose -f docker-compose.production.yml up -d
```

### Prerequisites
1. Set all variables in `.env` file with production values
2. Set `NODE_ENV=production`
3. Set `DATABASE_URL` with production database credentials
4. Set `REDIS_URL` with production Redis credentials
5. Set `JWT_SECRET` and `JWT_REFRESH_SECRET` with strong random values
6. Set `PAYMENT_PROVIDER` to `MPESA` or `STRIPE` with credentials (MOCK will fail)
7. Run `npx prisma migrate deploy`
8. **DO NOT** run `npm run db:seed` — it creates development data

### Fail-Closed Behavior
- MOCK payment provider is NOT ALLOWED in production (enforced by PaymentProviderFactory)
- Missing payment credentials cause application startup failure
- Invalid configuration is rejected at startup, not runtime
- If `PAYMENT_PROVIDER` is unset in production, defaults to MOCK then THROWS error

## Production Configuration Review (B38 Verified)

### Verified
- NODE_ENV: Configurable via env (MUST be set to `production` in production)
- DATABASE_URL: Uses env var, not hardcoded
- REDIS_URL: Uses env var, not hardcoded
- CORS: Restricted to `config.frontendUrl` (not unrestricted)
- Mock payment protection: FAIL-CLOSED in production
- No secrets committed to git (`.env` not tracked)
- Error handling: No stack traces, no secrets leaked in production mode

## Production Configuration Review (B38.4 Verified)

### Verified
- Next.js upgraded to 16.3.5 (resolved SSRF CVSS 8.6 and DoS CVSS 7.5+ vulnerabilities)
- Next.js rewrites: Internal proxy only (hardcoded localhost destination, not user-controlled)
- No user-controlled URL fetching in server-side code
- Docker images built and verified (API, Web, Worker)
- All images run as non-root user (nodejs uid 1001)
- No .env files in Docker images
- TypeScript config updated for Next.js 16 (jsx: react-jsx)

### Not Verified (External Dependencies)
- M-Pesa credentials: Empty (NOT VERIFIED)
- Stripe credentials: Empty (NOT VERIFIED)
- SMTP/email: Empty credentials (NOT VERIFIED)
- SMS: Empty (NOT VERIFIED)
- WhatsApp: Empty (NOT VERIFIED)
- Backup destination: Local filesystem (verified for B38 testing)
- Monitoring: Not configured (NOT VERIFIED)
- DNS: Not configured (NOT VERIFIED)
- TLS: Not configured (NOT VERIFIED)
- E2E browser tests: NOT EXECUTED (browser environment unavailable)
