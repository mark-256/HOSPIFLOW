# Testing

## Run tests

```bash
npm run test
```

Run a focused suite from the API workspace:

```bash
cd apps/api
npx vitest run tests/unit/
npx vitest run tests/integration/
```

The integration suite TRUNCATEs and re-seeds on every run, so it requires an
isolated test database and refuses to start without one:

```bash
export DATABASE_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow"
export DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"

# One-time: create the test database and apply Prisma migrations to it only.
# The hospiflow role has no CREATEDB, so create it once as a superuser:
#   sudo -u postgres createdb -O hospiflow hospiflow_test
scripts/setup-test-db.sh

npm run test
```

`npm test` fails immediately if `DATABASE_TEST_URL` is unset or resolves to the
same database as `DATABASE_URL`; it never falls back to the development
database. See `.env.example` for the Docker-versus-host URL conventions.

The BullMQ tests in `apps/api/tests/integration/bullmq.test.ts` need Redis:

```bash
export REDIS_URL="redis://localhost:6379"   # or redis://redis:6379 inside Docker
scripts/redis-health-check.sh
```

## Infrastructure validation

```bash
scripts/b38-validation.sh
```

Runs the isolation, Redis, BullMQ and development-database-protection checks.

## E2E

```bash
npm run test:e2e
```

## API

Tests are in `apps/api/tests/`, grouped into `unit/` and `integration/`.
Integration coverage includes authentication, tenant isolation, payments,
inventory, reservations, and other API workflows.

## Code checks

```bash
npm run lint
npm run typecheck
npm run build
```
