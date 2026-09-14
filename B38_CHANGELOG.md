# B38 Changelog

## Version 1.0.0-B38

### Payment System
- Payment provider architecture with MPESA, STRIPE, and MOCK providers
- Payment initiation, verification, and refund endpoints
- Webhook endpoints for MPESA and Stripe providers
- Idempotency key support for payment initiation and order payment
- Duplicate callback protection for webhooks
- Payment provider factory with production fail-closed validation

### Financial Engine
- Tax engine with exclusive/inclusive pricing modes
- Discount engine with percentage and fixed discount types
- Refund engine with overpayment protection
- Folio financial tracking (charges, discounts, payments, refunds, balance)
- Server-authoritative pricing (never trusts client-submitted totals)

### Security
- JWT authentication with access and refresh tokens
- RBAC via permission-based middleware
- Tenant isolation via organizationId scoping
- Rate limiting on all API endpoints
- Audit logging for sensitive operations
- Helmet, CORS protection

### Inventory
- Recipe-based inventory deduction on order completion
- Stock movement tracking
- Duplicate completion prevention (state machine enforcement)

### Infrastructure
- Docker multi-service architecture (API, Web, Worker)
- PostgreSQL with Prisma ORM
- Redis with BullMQ for background jobs
- Automated backup scheduling via worker

### Bug Fixes
- Fixed AuditAction enum missing ORDER_COMPLETED value in database
- Fixed test database port configuration for local development

### Known Issues
- Production M-Pesa credentials not available
- Production Stripe credentials not available
- npm audit shows 20 vulnerabilities (pre-existing dependencies)
