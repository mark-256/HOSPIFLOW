# Architecture

## Monorepo

- `apps/api` - Express backend
- `apps/web` - Next.js frontend
- `apps/worker` - Background jobs
- `packages/database` - Prisma schema + client
- `packages/types` - Shared TypeScript types
- `packages/config` - Shared configuration

## API Design

RESTful JSON API under `/api`.

Layered architecture:
Route → Controller → Service → Repository → PostgreSQL

## Auth

JWT access tokens + refresh tokens stored in DB sessions.

## Multi-tenancy

Organization → Property → Outlet → Terminal

Every sensitive query filters by `organizationId` or `propertyId`.

## Offline

IndexedDB queue in browser. On reconnect, POST queued actions with idempotency keys.

## Integrations

Adapter pattern for M-Pesa, Stripe, Email, SMS, WhatsApp. Mock adapters provided.
