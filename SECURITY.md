# Security

- Helmet, CORS, rate limiting enabled
- Passwords hashed with bcrypt
- JWT access + refresh tokens
- Tenant isolation via `organizationId` / `propertyId`
- No plain-text secrets in repo
- Audit logs for sensitive actions
