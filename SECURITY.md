# Security

## Authentication and authorization

- JWT access and refresh tokens are used for authentication.
- Passwords are hashed with bcrypt.
- Permission-based RBAC protects restricted operations.
- Rate limiting is applied to API routes, including login.

## Tenant isolation

- Organization and property ownership must be checked for tenant-scoped data.
- Sensitive database operations must be scoped to the authenticated tenant.
- Audit records are tenant-scoped and cannot be modified through the API.

## Payments

- Production payment configuration must fail closed rather than silently use a mock provider.
- Payment provider credentials are validated at startup.
- Idempotency keys protect payment operations from duplicate requests.
- Webhook signatures are verified for supported providers.
- Refund amounts and server-side financial calculations are validated.

## Data and API protection

- Keep secrets in environment variables; never commit credentials.
- Helmet security headers and trusted-origin CORS configuration are enabled.
- Validate user input, identifiers, enum values, dates, and monetary amounts on the server.
- Production errors must not expose stack traces, database details, or filesystem paths.
- Sensitive operations are recorded in audit logs.

See [`.env.example`](./.env.example) for configuration names and [docs/PRODUCTION_CONFIGURATION.md](./docs/PRODUCTION_CONFIGURATION.md) for production setup.
