# Testing

## Overview

HOSPIFLOW uses Vitest for unit and integration testing, and Playwright for E2E testing.

## Running Tests

### All Tests
```bash
npm run test
```

### Unit Tests Only
```bash
npx vitest run tests/unit/
```

### Integration Tests Only
```bash
npx vitest run tests/integration/
```

### E2E Tests
```bash
npm run test:e2e
```

## Test Structure

```
apps/api/tests/
├── unit/           # Unit tests (33 tests)
│   ├── taxEngine.test.ts
│   ├── discountEngine.test.ts
│   ├── refundEngine.test.ts
│   ├── payments.test.ts
│   └── pagination.test.ts
├── integration/    # Integration tests (97 tests)
│   ├── payments.test.ts
│   ├── taxAndDiscount.test.ts
│   ├── tenantIsolation.test.ts
│   ├── rbac.test.ts
│   ├── auditLog.test.ts
│   ├── inventory.test.ts
│   ├── transactions.test.ts
│   ├── idempotency.test.ts
│   ├── pos.test.ts
│   ├── hotelPMS.test.ts
│   ├── roomService.test.ts
│   ├── reservationConcurrency.test.ts
│   ├── auth.test.ts
│   └── ...
└── helpers/        # Test helpers
    ├── app.ts
    ├── auth.ts
    ├── seed.ts
    ├── testDb.ts
    └── testEnv.ts
```

## Test Results

| Type | Count |
|------|-------|
| Unit tests | 33 |
| Integration tests | 97 |
| Total | 130 |
| Passing | 130 |
| Failing | 0 |

## Prerequisites for Integration Tests

Integration tests require a PostgreSQL database. The test configuration expects:
- Database URL configured via DATABASE_URL environment variable
- Test database with schema applied via Prisma migrations
- Redis running for BullMQ worker tests

## Test Database Setup

```bash
# Set up test database
createdb hospiflow_test
# Or update DATABASE_URL to point to existing database
```

## Coverage Areas

- Payment processing (initiate, verify, refund, webhooks)
- Financial calculations (tax, discount, refund, folio balance)
- Tenant isolation (cross-tenant access denied)
- RBAC (role-based access control)
- Audit logging (event creation and tenant scoping)
- Inventory deduction (order completion triggers)
- Idempotency (duplicate request prevention)
- Order state machine (valid/invalid transitions)
- Input validation (invalid inputs produce 4xx)
- Error handling (no sensitive data leaked)

## Linting
```bash
npm run lint
```

## Type Checking
```bash
npm run typecheck
```

## Build
```bash
npm run build
```
