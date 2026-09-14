# Security

## Authentication

- JWT-based authentication with access and refresh tokens
- Access token expiry: 15 minutes (configurable)
- Refresh token expiry: 7 days (configurable)
- Tokens stored in HTTP-only cookies (when available)
- Bearer token authentication for API endpoints

## Authorization

- Permission-based RBAC system
- 40+ permissions organized by role
- Middleware enforces permissions on all protected routes
- Role hierarchy: SUPER_ADMIN > ORG_ADMIN > GENERAL_MANAGER > ... > CUSTOMER

## Tenant Isolation

- All data scoped by organizationId
- Cross-tenant access DENIED for all resources
- Database queries include organizationId filters
- Audit logs are tenant scoped

## Payment Security

- Payment provider fail-closed in production (no MOCK fallback)
- Payment provider credentials validated at startup
- Idempotency keys prevent duplicate payments
- Webhook signature verification (Stripe)
- Refund amount validation (cannot exceed paid amount)
- Server-authoritative financial calculations

## Data Protection

- Passwords hashed with bcrypt (10 rounds)
- No plain-text secrets in repository
- Environment variables for all sensitive configuration
- Helmet security headers enabled
- CORS configured for trusted origins only

## Rate Limiting

- Express rate limiter on all /api/ routes
- Default: 100 requests per 15-minute window
- Login endpoint protected (rate limited)
- Webhooks exempt (external provider traffic)

## Input Validation

- All user inputs validated server-side
- Monetary amounts validated (positive, finite)
- Enum values validated against allowed values
- ID parameters checked for valid format
- Date parameters parsed and validated

## Error Handling

- Generic error messages in production
- No stack traces in responses
- No database error details exposed
- No filesystem paths exposed
- No internal information leaked

## Audit Logging

- All sensitive operations logged (payment, refund, discount, order status, reservation, inventory, user management, configuration changes)
- Audit logs include: organizationId, userId, action, entity, entityId, timestamp, IP, user agent
- Audit logs are tenant scoped
- No API endpoint to modify audit records

## Known Vulnerabilities

- Next.js vulnerabilities remediated in B38.4 (upgraded from 14.2.35 to 16.3.5)
- 15 remaining npm audit vulnerabilities (see B38.4_SECURITY_HARDENING_REPORT.md)
  - 2 critical (bcrypt/tar build-time dependency)
  - 7 high (Prisma transitive, Nodemailer email service)
  - 6 moderate (test-only, build-only, low-risk runtime)
- All Next.js SSRF/DoS vulnerabilities RESOLVED
