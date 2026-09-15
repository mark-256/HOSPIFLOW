# Production Launch Checklist — HOSPIFLOW

Status values: `IMPLEMENTED`, `TESTED LOCALLY`, `VERIFIED IN TEST ENVIRONMENT`, `VERIFIED IN SANDBOX`, `VERIFIED IN PRODUCTION`, `NOT VERIFIED`, `NOT APPLICABLE`.

## PRE-DEPLOYMENT

- [ ] Git release identified — **IMPLEMENTED** (B38.5 gate commit `756e256`)
- [ ] Working tree reviewed — **IMPLEMENTED** (baseline was clean; review final diff before release)
- [ ] Dependency audit reviewed — **IMPLEMENTED** (15 findings classified; 0 production blockers)
- [ ] No production blocker vulnerabilities — **IMPLEMENTED**
- [ ] Required environment variables configured — **NOT VERIFIED** (local `.env` and process environment are absent)
- [ ] Secrets stored securely — **NOT VERIFIED** (runtime secret store/production platform not inspected)
- [ ] Payment provider selected — **NOT VERIFIED** (set `PAYMENT_PROVIDER=MPESA` or `STRIPE`)
- [ ] Mock payments disabled — **IMPLEMENTED** (production mock startup fails closed)
- [ ] Database backup available — **NOT VERIFIED** (validation backup/restore passed; production destination not verified)
- [ ] Migration status reviewed — **NOT VERIFIED** (no production `DATABASE_URL` available)
- [ ] Production-safe bootstrap confirmed — **IMPLEMENTED** (no production bootstrap required; development seed is prohibited)
- [ ] Docker images built — **TESTED LOCALLY** (API, Web, Worker production images built)
- [ ] Image security checked — **TESTED LOCALLY** (non-root users; no `.env` or secret-bearing history)
- [ ] Rollback release identified — **NOT VERIFIED** (record production image tags/configuration before launch)

### Environment Variables
- [ ] NODE_ENV set to `production`
- [ ] DATABASE_URL configured with production PostgreSQL
- [ ] REDIS_URL configured with production Redis
- [ ] JWT_SECRET set (long, random, secure)
- [ ] JWT_REFRESH_SECRET set (long, random, secure)
- [ ] PAYMENT_PROVIDER set (MPESA or STRIPE, NOT MOCK)
- [ ] MPESA_CONSUMER_KEY set (if MPESA provider)
- [ ] MPESA_CONSUMER_SECRET set (if MPESA provider)
- [ ] MPESA_PASSKEY set (if MPESA provider)
- [ ] MPESA_SHORTCODE set (if MPESA provider)
- [ ] STRIPE_SECRET_KEY set (if STRIPE provider)
- [ ] STRIPE_WEBHOOK_SECRET set (if STRIPE provider)
- [ ] SMTP_HOST, SMTP_USER, SMTP_PASSWORD configured (if email needed)
- [ ] SESSION_SECRET set (long, random, secure)

### Secrets
- [ ] No secrets committed to git
- [ ] .env file NOT in repository
- [ ] .env.example contains only placeholders

### Database
- [ ] PostgreSQL 16 running
- [ ] Prisma migrations applied: `npx prisma migrate deploy`
- [ ] Schema validated: `npx prisma validate`
- [ ] Client generated: `npx prisma generate`
- [ ] Database backup completed and verified

### Migrations
- [ ] All pending migrations deployed
- [ ] Migrations run before application traffic
- [ ] Migration rollback plan documented

### Redis
- [ ] Redis running and accessible
- [ ] REDIS_PASSWORD set (if applicable)
- [ ] Redis connection verified by worker startup

### Payments
- [ ] M-Pesa credentials configured and verified
- [ ] Stripe credentials configured and verified
- [ ] Mock payment blocked in production (fail-closed verified)
- [ ] Payment provider factory initializes without error

### Backup
- [ ] Backup directory configured and writable
- [ ] Backup schedule configured (default: daily 02:00)
- [ ] Backup retention configured (default: 7 days)
- [ ] Backup executed and verified (B38: VERIFIED IN VALIDATION ENVIRONMENT)

### Monitoring
- [ ] Health check endpoint accessible: `/health`
- [ ] Logging configured for production
- [ ] Error responses do not expose stack traces

### DNS
- [ ] Domain configured for API endpoint
- [ ] Domain configured for frontend

### TLS
- [ ] HTTPS configured for API
- [ ] HTTPS configured for frontend
- [ ] SSL certificate valid and not expired

### CORS
- [ ] CORS origin restricted to frontend URL (NOT wildcard)
- [ ] CORS credentials enabled

### Rate Limits
- [ ] Rate limit window configured (default: 900000ms / 15 min)
- [ ] Rate limit max configured (default: 100 requests/window)
- [ ] Rate limit applied to all /api/ routes

---

## DEPLOYMENT

- [ ] Deploy database migrations — **NOT VERIFIED** (run `docker-compose -f docker-compose.production.yml run --rm api npm run db:migrate`)
- [ ] Verify migration success — **NOT VERIFIED**
- [ ] Deploy API — **NOT VERIFIED**
- [ ] Deploy Web — **NOT VERIFIED**
- [ ] Deploy Worker — **NOT VERIFIED**
- [ ] Verify Redis — **NOT VERIFIED**
- [ ] Verify database connectivity — **NOT VERIFIED**
- [ ] Verify health endpoints — **TESTED LOCALLY** (Compose health checks are defined; production endpoints not exercised)

### Migration
- [ ] `npx prisma migrate deploy` executed successfully
- [ ] Migrations applied before application startup
- [ ] No destructive migration operations

### API
- [ ] API Docker container starts successfully
- [ ] API health check passes: `GET /health`
- [ ] API connects to PostgreSQL
- [ ] API connects to Redis
- [ ] API runs as non-root user (USER nodejs in Dockerfile)

### Worker
- [ ] Worker Docker container starts successfully
- [ ] Worker connects to PostgreSQL
- [ ] Worker connects to Redis
- [ ] Worker runs as non-root user (USER nodejs in Dockerfile)
- [ ] Worker backup scheduling functional

### Web
- [ ] Web Docker container starts successfully
- [ ] Web serves frontend correctly
- [ ] Web connects to API

### Health Checks
- [ ] API health endpoint: PASS
- [ ] Worker startup: PASS
- [ ] Redis connection: PASS
- [ ] PostgreSQL connection: PASS
- [ ] Web health check: PASS

### Smoke Tests
- [ ] Lint: PASS
- [ ] Typecheck: PASS
- [ ] Tests: 130/130 PASS
- [ ] Build: PASS
- [ ] Prisma validate: PASS

---

## POST-DEPLOYMENT

- [ ] Login — **NOT VERIFIED**
- [ ] Authentication — **NOT VERIFIED**
- [ ] Dashboard — **NOT VERIFIED**
- [ ] Guest lookup — **NOT VERIFIED**
- [ ] Reservation lookup — **NOT VERIFIED**
- [ ] Order lookup — **NOT VERIFIED**
- [ ] Folio lookup — **NOT VERIFIED**
- [ ] RBAC — **NOT VERIFIED**
- [ ] Tenant isolation — **NOT VERIFIED**
- [ ] Payment configuration — **NOT VERIFIED**
- [ ] Audit logging — **NOT VERIFIED**
- [ ] Worker processing — **NOT VERIFIED**
- [ ] Error monitoring — **NOT VERIFIED**

### Login
- [ ] Login with valid credentials: PASS
- [ ] Invalid login returns 401: PASS
- [ ] Expired token returns 401: PASS
- [ ] JWT access and refresh tokens functional

### Reservation
- [ ] Create reservation: PASS
- [ ] List reservations: PASS
- [ ] Update reservation: PASS
- [ ] Cancel reservation: PASS
- [ ] Cross-tenant reservation access: DENIED

### POS
- [ ] Create order: PASS
- [ ] Add items to order: PASS
- [ ] Update order status: PASS
- [ ] Order completion with inventory deduction: PASS

### KDS
- [ ] Kitchen display receives orders: PASS
- [ ] Order state transitions: PASS

### Payment
- [ ] Payment initiation with valid provider: PASS
- [ ] Payment verification: PASS
- [ ] Payment refund: PASS
- [ ] Idempotency: PASS
- [ ] Duplicate callback protection: PASS

### Folio
- [ ] Folio creation: PASS
- [ ] Folio charges: PASS
- [ ] Folio payments: PASS
- [ ] Folio balance calculation: PASS
- [ ] Folio closure: PASS

### Inventory
- [ ] Stock levels accurate: PASS
- [ ] Order completion deducts inventory: PASS
- [ ] Stock movement recorded: PASS
- [ ] Duplicate completion denied: PASS

### Audit
- [ ] Audit logs created for sensitive operations: PASS
- [ ] Audit logs tenant scoped: PASS
- [ ] Audit logs cannot be modified via API: PASS

### Monitoring
- [ ] Application logs collected
- [ ] Error tracking configured
- [ ] Performance monitoring configured
- [ ] No stack traces in production error responses

---

## ROLLBACK

- [ ] Stop rollout — **IMPLEMENTED** (procedure documented)
- [ ] Preserve logs — **IMPLEMENTED** (procedure documented)
- [ ] Select previous release — **NOT VERIFIED**
- [ ] Restore application image — **IMPLEMENTED** (procedure documented)
- [ ] Verify schema compatibility — **IMPLEMENTED** (procedure requires compatibility check)
- [ ] Restore database if required — **IMPLEMENTED** (backup restore/forward fix documented)
- [ ] Restart services — **IMPLEMENTED** (procedure documented)
- [ ] Run smoke tests — **IMPLEMENTED** (procedure documented)
- [ ] Confirm service health — **IMPLEMENTED** (procedure documented)
- [ ] Confirm critical workflows — **IMPLEMENTED** (procedure documented)

### Application Rollback
- [ ] Previous Docker image tag available
- [ ] Rollback command documented:
  ```bash
  docker-compose -f docker-compose.production.yml pull <previous-tag>
  docker-compose -f docker-compose.production.yml up -d
  ```

### Infrastructure Rollback
- [ ] Infrastructure-as-code rollback plan documented
- [ ] Database migration rollback plan documented (forward-fix for irreversible migrations)
- [ ] Configuration rollback documented (env var change + container restart)

### Database Rollback
- [ ] Forward-fix strategy documented for irreversible migrations
- [ ] Backup restoration procedure documented (see DISASTER_RECOVERY.md)
- [ ] **DO NOT** blindly roll PostgreSQL migrations backward

### Configuration Rollback
- [ ] Environment variable changes can be reverted
- [ ] Payment provider configuration can be reverted
- [ ] CORS/origin changes can be reverted

### Emergency Shutdown
- [ ] Emergency shutdown procedure documented:
  ```bash
  docker-compose -f docker-compose.production.yml down
  ```
- [ ] Graceful shutdown tested (SIGTERM/SIGINT handlers in server.ts and worker.ts)

## Seed Safety

`npm run db:seed` is development-only and creates demo organizations, users, rooms, reservations, orders, and financial records. **DO NOT RUN IN PRODUCTION.** No production bootstrap is required beyond migrations and an explicitly approved, idempotent administrative bootstrap if one is introduced later.
