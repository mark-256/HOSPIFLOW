# Deployment

## Production build

```bash
docker-compose -f docker-compose.production.yml build api web worker
```

## Production startup

```bash
docker-compose -f docker-compose.production.yml up -d postgres redis
docker-compose -f docker-compose.production.yml run --rm api npm run db:migrate
docker-compose -f docker-compose.production.yml up -d api web worker
```

The migration step is mandatory and must complete before application startup. `npm run db:migrate` runs `prisma migrate deploy`; do not use `prisma db push` in production. The existing seed command creates demo organizations, users, rooms, reservations, orders, and financial records and is development-only: **DO NOT RUN IN PRODUCTION**.

Production health checks are defined for PostgreSQL, Redis, API, Web, and Worker. API health is `/health`, Web health uses the root endpoint, and Worker health checks process liveness. Secrets are supplied through the environment and are not baked into images.

## Rollback

1. Stop the rollout and preserve logs.
2. Identify the previous known-good image tags and compatible configuration.
3. Restore the previous application images with `docker-compose pull` and the recorded tags/configuration.
4. Do not run an application image against an incompatible schema. If the deployed migration is reversible and has a tested down migration, use it only after backup; otherwise use a database restore or a forward corrective migration.
5. Restore the database from the latest verified backup when required (`pg_restore ...`), then restart services.
6. Run smoke tests, confirm health, authentication, tenant isolation, and critical business workflows, and document the incident.

Database rollback is **BACKUP RESTORE / FORWARD FIX**; Prisma migrations are not assumed to be reversible.

## Environment

Set all variables in `.env` before deploying. Never commit secrets. The deployment environment must explicitly select `PAYMENT_PROVIDER=MPESA` or `PAYMENT_PROVIDER=STRIPE`; mock is rejected in production.
