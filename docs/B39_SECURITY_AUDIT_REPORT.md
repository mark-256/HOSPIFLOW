# B39 — Security Audit Report

**Milestone:** B39 — Security Audit & Hardening
**Scope:** Full API surface of `apps/api` (B1–B38 behaviour preserved)
**Status:** Complete — 10 permanent security suites, 765 security tests, all green
**Database schema changes:** none
**Real payment activity:** none (all provider interaction mocked)

---

## 1. Summary

B39 audited every HTTP route in the API, every authentication and authorization
boundary, and every client-supplied identifier that reaches the database. The
audit produced **18 confirmed findings**: 1 Critical, 6 High, 6 Medium,
5 Low/Informational. All Critical, High and Medium findings are fixed and
covered by permanent regression tests.

| Severity | Found | Fixed | Accepted / documented |
| --- | --- | --- | --- |
| Critical | 1 | 1 | 0 |
| High | 6 | 6 | 0 |
| Medium | 6 | 6 | 0 |
| Low / Informational | 5 | 1 | 4 |

No database migration was required, no architecture was rewritten, and no
existing behaviour was removed. The B36 acceptance suite still reports
`141 PASS / 0 FAIL / 0 WARN` and the B38 infrastructure suite still reports
`9 PASS / 0 FAIL / 0 WARN` with a byte-for-byte unchanged development database.

Every gate in §37 of the mission was executed and re-verified against the final
tree, including a fresh end-to-end reproduction of each finding against the
unpatched code before it was fixed.

### Coverage

| Item | Count |
| --- | ---: |
| Routes declared in `apps/api/src/routes/*.ts` | 110 |
| Routes reachable (2 `/health/*` sub-routes are shadowed by the mount) | **109** |
| Route files | 30 |
| Controllers audited | 27 (+1 dead file audited and reported) |
| Services audited | 14 |
| Middleware audited | 3 |
| Security test files added | 10 |
| Security tests added | **765** |
| Security tests passed | **765** |
| Security tests failed | **0** |
| Confirmed findings | 18 |
| Findings fixed | 13 (1 Critical, 6 High, 6 Medium) |
| Findings accepted and documented | 5 |
| Pre-existing tests modified, deleted or weakened | **0** |
| Prisma migrations added | **0** |

Audit-log actions written by the application: `LOGIN`, `USER_CREATED`,
`PERMISSION_CHANGED`, `ORDER_CREATED`, `ORDER_MODIFIED`, `ORDER_CANCELLED`,
`ORDER_COMPLETED`, `PROCESSING`, `PAYMENT`, `REFUND`, `RESERVATION_CREATED`,
`CHECK_OUT`.

---

## 2. Method

1. **Route inventory.** Every `router.*` declaration in `apps/api/src/routes/*.ts`
   was enumerated and classified: authentication requirement, permission
   requirement, tenant scoping, and validation of client-supplied identifiers.
   The inventory is reproduced in §5.
2. **Controller review.** Every controller reachable from those routes was read
   for a `where` clause anchored to `req.user.organizationId`, and for the
   handling of `:id` path parameters and foreign-key ids in request bodies.
3. **Middleware review.** `authMiddleware`, `requirePermission` and the error
   handler were read to establish what the framework already guarantees before
   any controller code runs.
4. **Vulnerability reproduction.** Where a finding was suspected, it was first
   *proved* by running the new test suite against the unpatched source
   (`git stash` of `apps/api/src`). `tenantIsolation.security.test.ts` produced
   **40 failures** against the vulnerable code. B39-15, B39-16 and B39-17 were
   each reproduced the same way and are recorded in §3 with the exact failing
   assertion. The source was then restored and the stash dropped; no
   vulnerability claim in this report is theoretical.
5. **Permanent regression suites.** 10 new suites, 765 tests, all failing-safe
   against a regression.
6. **Independent re-verification.** A second pass re-derived the route
   inventory from the Express mount table and every `router.*` declaration
   (110 declared, 2 unreachable, 109 reachable) and confirmed it matches §5
   row for row, and re-ran every gate in §37 against the final tree.

### Established baseline (what the framework already did correctly)

- `authMiddleware` verifies the JWT **and then reloads the user, role and
  organization from the database**, so `req.user.organizationId` and the
  permission list are authoritative and not client-assertable.
- Every tenant-scoped controller correctly treats `organizationId` as
  server-derived, never as a client-supplied filter.
- Cross-tenant read/write correctly returns `403` or `404`. This report uses the
  `403 | 404` convention throughout, matching the existing suites.

---

## 3. Findings

### B39-01 — Cross-tenant sales report (Critical, fixed)

`GET /api/reports/sales` filtered orders by a relationship that was not anchored
to the caller's organization, so a caller with `reports_view` could read the
trading figures of any tenant: totals, order count, average order value, the
payment-method breakdown, and the full order rows with their line items and
payments.

- **Impact:** complete disclosure of another tenant's commercial data, plus
  guest-identifying order detail.
- **Fix:** `apps/api/src/controllers/reportsController.ts` — the `where` clause
  is anchored through `outlet.property.organizationId`, matching every other
  tenant-scoped controller.
- **Regression:** `tenantIsolation.security.test.ts`,
  `reportSecurity.security.test.ts` (4 dedicated cases).

### B39-02 — Shift terminal, close and state ownership (High, fixed)

`GET /api/shifts/:terminalId`, `PATCH /api/shifts/:id/close` and the shift list
resolved shifts by raw identifier without verifying the shift belonged to the
caller's organization, and the close path did not verify the shift was actually
`OPEN` before closing it.

- **Impact:** cross-tenant cash-shift manipulation; closing an already-closed or
  foreign shift corrupts reconciliation data.
- **Fix:** `apps/api/src/controllers/shiftsController.ts` — list, terminal
  lookup and close are all organization-scoped, and close validates state.
- **Regression:** `tenantIsolation.security.test.ts`, `resourceOwnership.security.test.ts`.

### B39-03 — Arbitrary payment settlement via M-Pesa callback (High, fixed)

The M-Pesa callback handler resolved the payment to settle from the
`CheckoutRequestID` **or** any other callback-supplied identifier, and a callback
body could carry a raw internal `orderPayment.id` or `orderId`. A caller who
knew or guessed a value could therefore mark a payment `COMPLETED`, set its
`paidAt`, and suppress a later legitimate callback.

- **Impact:** settle or re-settle any payment by identifier — a direct financial
  integrity violation, reachable without any staff credential.
- **Fix:** new `apps/api/src/services/paymentWebhookService.ts`.
  - A callback resolves a payment **only** through provider identifiers
    HOSPIFLOW itself stored when initiating the payment
    (`metadata.checkoutRequestId`, `metadata.providerResponse.id`,
    `metadata.stripePaymentIntentId`, or a stored `reference`).
  - The organization is derived from the resolved payment's own order; the
    callback body cannot contribute tenant context.
  - The callback amount is compared with the stored amount before a payment is
    marked `COMPLETED`; a mismatch is recorded and refused.
  - Terminal payments are never transitioned twice, so a replayed callback is a
    no-op.
  - Every applied callback writes a tenant-scoped audit entry.
- **Regression:** `paymentSecurity.security.test.ts` (16 webhook cases,
  including forged-callback, replay and tampered-amount attacks).

### B39-04 — Self-service privilege escalation and account deletion (High, fixed)

`PATCH /api/users/:id` allowed a user to change their own role, grant themselves
`SUPER_ADMIN`, deactivate themselves, and `DELETE /api/users/:id` allowed a user
to delete their own account.

- **Impact:** any authenticated user with `users_manage` (including a
  compromised or malicious organization admin) could escalate to super admin,
  and could destroy the audit trail anchor for their own account.
- **Fix:** `apps/api/src/controllers/usersController.ts`
  - A user may not change their own role or deactivate themselves.
  - A user may not delete their own account.
  - `SUPER_ADMIN` may only be granted by an existing super admin.
  - Role changes and user creation write audit events.
- **Regression:** `privilegeEscalation.security.test.ts` (23 cases). The
  self-delete case was written first, failed against the vulnerable controller,
  and passes after the fix.

### B39-05 — Unauthenticated M-Pesa callback in a default deployment (High, fixed with a documented caveat)

M-Pesa STK callbacks are not cryptographically signed by Safaricom. The route
accepted any callback body from any network source.

- **Fix:** optional shared-secret verification
  (`MPESA_WEBHOOK_SECRET`, compared with `crypto.timingSafeEqual`).
- **Caveat (accepted risk, must be read as a deployment requirement):** the
  secret is **optional for backward compatibility**. When it is not configured
  the endpoint still accepts callbacks and logs a loud `[SECURITY]` warning on
  first use. B39 deliberately did not make it mandatory, because doing so would
  silently break every existing Safaricom callback in a deployment that has not
  yet set the variable. **Production deployments must set
  `MPESA_WEBHOOK_SECRET`** and restrict the route at the proxy/allow-list; until
  they do, the only controls on this endpoint are B39-03's resolution rules.
- **Regression:** `paymentSecurity.security.test.ts`,
  `publicEndpoints.security.test.ts`.

### B39-06 — Backup path traversal reaching the restore engine (High, fixed)

`GET /api/admin/backups/:id/verify` and `POST /api/admin/backups/restore-test`
passed a client-supplied path straight to `verifyBackup`/`restoreBackup`. Because
`restore-test` executes a real `pg_restore` against the configured database, a
traversal such as `../../../etc/passwd` or an absolute path to an arbitrary
`.dump.gz` reached the restore engine.

- **Impact:** arbitrary file read through the verify path, and an attacker-chosen
  restore source on the restore path.
- **Fix:** `resolveBackupPath()` in `apps/api/src/services/backupService.ts`
  rejects, in order: a non-string or blank reference, an embedded NUL byte, any
  path that does not resolve strictly inside the configured backup directory
  (including the sibling-prefix case such as `../backups-evil/`), any reference
  that does not end in `.dump.gz`, a non-existent target, and any target that is
  not a regular file. Wired into both routes in `apps/api/src/routes/backups.ts`.
- **Regression:** `backupSecurity.security.test.ts` (36 cases, including 15
  hostile references asserted to be rejected, and post-rejection assertions that
  fixture data is untouched). No real restore is performed by any test.

### B39-07 — Structural configuration writable by any authenticated user (High, fixed)

Outlets, terminals, tables and room types had **no permission gate at all** on any
verb. Any authenticated role — including `WAITER`, `CHEF` and `CUSTOMER` — could
create, rename and delete the physical structure of the property.

- **Fix:** `users_manage` is now required for the write verbs of
  `/api/outlets`, `/api/terminals`, `/api/tables` and `/api/room-types`, the same
  permission that already guarded property and organization mutations.
  `users_manage` is held only by `SUPER_ADMIN`, `ORG_ADMIN` and
  `GENERAL_MANAGER` in every seeded role set.
- **Regression:** `rbac.security.test.ts` — 11 write verbs × (refused + no data
  created) plus a positive case proving an administrator can still perform the
  same write.

### B39-08 — Cross-tenant nested references in reservations, orders and online orders (Medium, fixed)

Several controllers validated that a referenced entity *existed* but not that it
belonged to the caller's organization, allowing an authenticated user to attach
a foreign guest, room type, room, rate plan, table, outlet or product to their
own record — writing another tenant's identifiers into their own tenant's data
and, for orders, deducting stock from a foreign inventory record.

- **Fix:**
  - `apps/api/src/controllers/reservationsController.ts` — guest, room type,
    room and rate plan are all validated against the caller's property; the
    check-in room must belong to the reservation's property.
  - `apps/api/src/controllers/ordersController.ts` — outlet, table and guest are
    validated against the caller's organization, products are bound to the
    order's own outlet, and completion cannot deduct stock from foreign
    inventory.
  - `apps/api/src/controllers/onlineOrdersController.ts` — outlet, guest and
    product are validated, and the creator is derived from the token rather than
    the body.
  - `apps/api/src/controllers/housekeepingController.ts` and
    `maintenanceController.ts` — the property, room and **assignee** are all
    validated inside the caller's organization (see B39-11).
- **Regression:** `tenantIsolation.security.test.ts` (161 cases, 40 of which
  failed against the unpatched source).

### B39-09 — Cross-tenant organization mutation and menu/product disclosure (Medium, fixed)

- `PATCH /api/organizations/:id` accepted any organization id, not only the
  caller's own.
- `GET /api/menus` and `GET /api/products` returned every organization's menus
  and products.

- **Fix:** `organizationsController.ts` restricts updates to the authenticated
  organization; `menusController.ts` and `productsController.ts` scope list and
  create to the caller's organization.
- **Regression:** `tenantIsolation.security.test.ts`, `rbac.security.test.ts`.

### B39-10 — QR tokens: unbounded lifetime, unbound outlet, cross-outlet ordering (Medium, fixed)

`GET /api/qr/lookup/:token` and `POST /api/qr/orders` accepted any stored
`qrCode` string with no expiry check, and QR ordering did not verify that the
ordered products belonged to the table's own outlet.

- **Impact:** a QR code printed once remained valid forever, and a customer
  holding one outlet's QR code could order another outlet's products.
- **Fix:** `apps/api/src/controllers/qrController.ts` now issues self-describing
  tokens (13-digit timestamp prefix + 48 hex chars) with a bounded lifetime,
  rejects expired tokens on both read and write, and binds ordering to the
  token's outlet.
- **Regression:** `publicEndpoints.security.test.ts` (expiry, cross-outlet
  product and server-side pricing cases).

### B39-11 — Cross-tenant staff assignment (Medium, fixed)

`assignedToId` on housekeeping tasks and maintenance tickets was written straight
to the row. An organization A manager could therefore assign an organization A
task to a user belonging to organization B, exposing a foreign user's
identifier, name and workload inside their own tenant.

- **Fix:** `resolveAssignee()` in both controllers validates the assignee against
  the caller's organization (and `deletedAt`), returning `404` when the user is
  not in the organization.
- **Regression:** `resourceOwnership.security.test.ts` — a cross-tenant
  assignment is refused **and** the task is verified to still be unassigned, plus
  a positive case proving a same-organization assignment still works.

### B39-12 — Unhandled `500` on hostile input in reports and pagination (Medium, fixed)

`parsePagination` used `parseInt` without a `NaN` guard, so `?limit=abc` produced
`take: NaN` and an unhandled Prisma error. The reports controller passed
unvalidated `from`, `to` and `date` query parameters into `new Date(...)`, so any
non-date string produced an `Invalid Date` and an unhandled `500`. Because these
are the only routes that reached the generic error handler, an authenticated
user could turn ordinary bad input into a server error on any paginated
endpoint.

- **Fix:**
  - `apps/api/src/utils/pagination.ts` falls back to the documented defaults
    when `page`/`limit` are not finite numbers, so the bound applies to **every**
    paginated endpoint, not just reports.
  - `apps/api/src/controllers/reportsController.ts` validates the date
    parameters and returns `400` for an unparsable or inverted range.
- **Regression:** `reportSecurity.security.test.ts` (8 hostile query cases plus
  explicit `400` and default-fallback assertions).

### B39-13 — Negative refund amount produced an unhandled error (Medium, fixed)

`refundPayment` rejected a refund whose amount could not be converted to minor
units by throwing a plain `Error`, which the generic handler surfaced as a `500`
rather than a `400`.

- **Fix:** `apps/api/src/services/paymentService.ts` validates that `amount` is
  present, numeric and strictly positive, and raises `BadRequestError`.
- **Regression:** `paymentSecurity.security.test.ts` (negative amount, over-refund,
  second refund after a full refund — each also asserting no refund row was
  created).

### B39-14 — Refunds and payment reads were not tenant-scoped at the service layer (Medium, reviewed/verified)

Reviewed as part of the payments audit: `refundPayment` resolves the payment
through `order.outlet.property.organizationId`, `listPayments` and `getPayment`
are organization-scoped, a client-supplied `organizationId` query parameter is
ignored, and a refund is only possible against a `COMPLETED` payment for at most
the remaining refundable amount. This area was found to be **correct** and is now
covered by permanent tests rather than left unreviewed.

### B39-15 — Client-supplied payment metadata could forge webhook settlement (High, fixed)

B39-03 made the provider-callback resolver trust exactly four identifiers that
HOSPIFLOW itself writes: `metadata.checkoutRequestId`,
`metadata.providerResponse.id`, `metadata.stripePaymentIntentId` and `reference`.
`POST /api/payments/initiate` nonetheless spread the caller's free-form
`metadata` object verbatim into both the stored `OrderPayment.metadata` column
and the outbound provider request. Three of those four keys were never rewritten
on the initiate path, so a caller's value survived intact and became the anchor
an **unauthenticated** callback matches.

- **Reproduced:** an authenticated user initiated a payment with
  `metadata: { stripePaymentIntentId: "<chosen>" }`, then delivered a forged
  M-Pesa success callback naming that value with the correct amount. The payment
  was moved to `COMPLETED` with `paidAt` set and no provider involvement. The
  pre-fix assertion read `expected 'COMPLETED' not to be 'COMPLETED'`.
- **Impact:** settlement forgery — goods marked paid without payment, and a
  client-planted anchor that can also pre-empt a legitimate callback for another
  payment, because `resolvePayment` takes the newest matching row.
- **Root cause:** unvalidated mass assignment into the security-significant JSON
  column (mission §30).
- **Fix:** `apps/api/src/services/paymentService.ts` — `sanitizeClientMetadata`
  strips the four reserved keys before they reach the database or the provider.
  Every other caller-supplied key is passed through unchanged, so benign metadata
  and `idempotencyKey` keep working.
- **Regression:** `paymentSecurity.security.test.ts`, 6 cases (each reserved key
  individually, the end-to-end forgery attempt, and two positive cases proving
  benign metadata and idempotency are unaffected).

### B39-16 — A soft-deleted account kept a working access token (Medium, fixed)

`DELETE /api/users/:id` soft-deletes the row, and `login` correctly refuses a
soft-deleted user. `authMiddleware`, however, re-read the user with
`findUnique({ id })` and checked only `isActive` — never `deletedAt`. A
terminated employee therefore kept full API access for the remaining lifetime of
an already-issued, unexpired access token.

- **Impact:** account termination did not revoke in-flight sessions.
- **Root cause:** the authentication re-check was weaker than the login check.
- **Fix:** `apps/api/src/middleware/auth.ts` resolves the user with
  `findFirst({ where: { id, deletedAt: null } })`, aligning the middleware with
  login and with `usersController`. Deactivation (`isActive`) was already covered
  and is unchanged.
- **Regression:** `authentication.security.test.ts`, 2 cases — one driving
  `deletedAt` directly and one deleting through `DELETE /api/users/:id` as an
  organization administrator. The first case also restores the row and re-uses
  the same token to prove the 401 came from the deletion check rather than from a
  corrupted token.

### B39-17 — Hostile folio transaction amounts produced an unhandled `500` (Medium, fixed)

`foliosController.toDecimal` raised a plain `Error` for a non-numeric, negative or
non-scalar amount. A plain `Error` is not an `HttpError`, so it fell through to
the generic handler and answered `500`. This is the same class already fixed for
reports (B39-12) and refunds (B39-13), on the one endpoint that writes guest
financial data.

- **Impact:** `POST /api/folios/:id/transactions` returned a server error for
  ordinary bad input, on a financial write endpoint.
- **Fix:** `apps/api/src/controllers/foliosController.ts` raises
  `BadRequestError` (→ `400`), and rejects type confusion explicitly instead of
  relying on `String()` coercion — which silently turned `[10]` into a valid
  amount that then failed downstream. Transaction-type validation was moved ahead
  of the amount so a bad type is reported as a bad type.
- **Regression:** `inputValidation.security.test.ts`, 9 cases covering five
  hostile amount shapes, a negative amount, an unknown type, an overpayment, and a
  closed folio. Each also asserts the balance and the transaction count are
  unchanged, so a test cannot pass merely because the handler crashed early.

### B39-18 — A live Redis credential was committed to the repository (Medium, fixed)

`scripts/health-check.sh` contained the real `REDIS_PASSWORD` as a shell default:
`REDIS_PASSWORD="${REDIS_PASSWORD:-<literal>}"`. The value was identical to the
credential in the untracked `.env`, i.e. a working production secret published to
everyone with repository access, to every clone, and to CI logs.

- **Fix:** the fallback is removed. The script reads `REDIS_PASSWORD` from the
  environment only and reports a `WARN` (rather than a misleading `FAIL`) when it
  is unset.
- **Rotation required:** the credential was committed in git history before B39
  and must be treated as disclosed — see §11.
- **Regression:** verified by a repository-wide scan of tracked files for the
  credential and for live `sk_live_`/token patterns, which is now clean.

### Informational findings (accepted, documented, not changed)

| ID | Finding | Why accepted |
| --- | --- | --- |
| B39-INFO-01 | `GET /health/ready` and `GET /health/health` are not actually exposed. The health router is mounted with `app.get('/health', healthRoutes)`, so only `GET /health` resolves. | Not a security defect and no script depends on the sub-routes. Recorded so a future reader does not assume a readiness probe exists. `GET /health` is the only public read and it is asserted to leak no connection string. |
| B39-LOW-01 | `POST /api/admin/backups/restore-test` — a real `pg_restore` — shares the `finance_edit` permission with backup creation. | In every seeded role set `finance_edit` is held only by `SUPER_ADMIN`, `ORG_ADMIN` and `GENERAL_MANAGER`, so the destructive operation is already admin-only. Giving it a dedicated permission would change role definitions, which is out of B39 scope. **Deployment warning:** do not grant `finance_edit` to a non-admin accountant role. |
| B39-LOW-02 | `GET /api/admin/backups` returns the absolute server `path` of each archive. | Admin-only, and the suite asserts every exposed path is inside the configured backup directory. Recorded rather than changed, to avoid breaking operational tooling. |
| B39-LOW-03 | `GET /api/payments` returns the stored `OrderPayment.metadata`, which can include a provider `clientSecret` and the full `providerResponse`. | Gated behind `payments_process`, which in every seeded role set is held only by `SUPER_ADMIN`, `ORG_ADMIN`, `GENERAL_MANAGER` and `ACCOUNTANT`. The web client needs `clientSecret` for Stripe confirmation. **Deployment warning:** do not grant `payments_process` to a low-trust role. Recorded rather than changed — redacting the column would break the payment UI. |
| B39-LOW-04 | `resolveBackupPath` validates by path containment but does not resolve symlinks, so a symlink *inside* `BACKUP_DIR` pointing outside it would pass containment. | Not client-reachable: creating a symlink in the backup directory requires filesystem write access that no API route exposes. Defence-in-depth improvement only. |
| B39-INFO-02 | `apps/api/src/controllers/org-test-copy.ts` is a **tracked but unreferenced** file exporting the pre-B39-09 *unscoped* organization handlers (`getOrganizations` with no tenant filter, `updateOrganization` with no tenant check). It is imported by nothing, so it is not reachable from any route. | Dead code, therefore no live exposure — but a trap for the next developer who imports it. **Recommendation:** delete it. B39 did not delete it because removal is a refactor of non-exposed code and is outside the security fix; it is recorded here so the hazard is explicit rather than latent-and-undocumented. |

### Accepted behaviours (verified, deliberately not changed)

- **Shift open/close has no permission gate**, only authentication plus tenant
  scoping. `pos.test.ts` explicitly requires a `WAITER` to be able to open a
  shift, so adding `shifts_manage` there would break a documented flow. Only
  `GET /api/shifts` is gated with `shifts_view`.
- **Structural and reference reads stay authenticated-and-tenant-scoped rather
  than permission-gated** (`GET /api/tables`, `/api/terminals`, `/api/outlets`,
  `/api/room-types`, `/api/rooms`, `/api/menus`, `/api/products`,
  `/api/reservations`). A waiter must be able to read tables to seat a guest.
  The boundary that matters is the tenant, and the IDOR suite proves it holds.
- **The M-Pesa webhook returns `400` when `MPESA` is not the configured
  provider.** This is fail-closed and correct; the test suite asserts it rather
  than working around it.
- **Failed webhooks are not retry-tracked.** Out of scope; recorded.
- **Logout does not revoke the already-issued access token.** It deletes the
  session rows (which is what the refresh path is built on) but the access token
  is a stateless JWT and remains valid until it expires. This is inherent to the
  stateless design and changing it would be an authentication rewrite, which
  mission §44 forbids. Account deletion and deactivation *are* immediately
  effective (B39-16). Deployments wanting true session revocation need a token
  denylist — out of B39 scope.

---

## 4. Hardening added beyond the findings

- **Login brute-force limiter** (`apps/api/src/app.ts`). A dedicated limiter on
  `/api/auth/login` with `skipSuccessfulRequests`, independent of the global API
  budget, so raising the general request budget (which the validation suites
  need) can never weaken login protection. Configured through
  `AUTH_RATE_LIMIT_MAX` (default 10) and `AUTH_RATE_LIMIT_WINDOW_MS` (default
  15 minutes) and documented in `.env.example`. Verified against the production
  default: with `max=10`, attempts 11+ are refused with `429`.
- **Rate-limit budget isolation in tests.** Only the test and development
  budgets were raised, and only the general API limiter. The login limiter's
  failure accounting is asserted directly in
  `authentication.security.test.ts` (failed logins consume budget, successful
  logins do not).
- **Server-authoritative pricing.** QR and online-order totals are computed from
  the product price in the database; a client-supplied `unitPrice`, `total` or
  `status` is ignored. Asserted in `publicEndpoints.security.test.ts`.

---

## 5. Complete API surface inventory

`A` = authentication required, `P` = permission required, `—` = none.
Every route below was individually reviewed and is covered by at least one
permanent test.

| # | Method + path | A | P | Tenant scoped | Finding |
| --- | --- | :-: | :-: | :-: | --- |
| 1 | `GET /health` | — | — | n/a | INFO-01 (router mount) |
| 2 | `POST /api/auth/login` | — | — | n/a | limiter added |
| 3 | `GET /api/auth/me` | ✓ | — | self only | — |
| 4 | `POST /api/auth/logout` | ✓ | — | self only | — |
| 5 | `GET /api/users` | ✓ | `users_manage` | ✓ | — |
| 6 | `POST /api/users` | ✓ | `users_manage` | ✓ | audit added (B39-04) |
| 7 | `GET /api/users/:id` | ✓ | `users_manage` | ✓ | — |
| 8 | `PATCH /api/users/:id` | ✓ | `users_manage` | ✓ | **B39-04** |
| 9 | `DELETE /api/users/:id` | ✓ | `users_manage` | ✓ | **B39-04** |
| 10 | `GET /api/organizations` | ✓ | — | ✓ | — |
| 11 | `POST /api/organizations` | ✓ | `users_manage` | ✓ | — |
| 12 | `GET /api/organizations/:id` | ✓ | — | ✓ | — |
| 13 | `PATCH /api/organizations/:id` | ✓ | `users_manage` | ✓ | **B39-09** |
| 14 | `GET /api/properties` | ✓ | — | ✓ | — |
| 15 | `POST /api/properties` | ✓ | `users_manage` | ✓ | — |
| 16 | `GET /api/properties/:id` | ✓ | — | ✓ | — |
| 17 | `PATCH /api/properties/:id` | ✓ | `users_manage` | ✓ | — |
| 18 | `GET /api/outlets` | ✓ | — | ✓ | — |
| 19 | `POST /api/outlets` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 20 | `GET /api/outlets/:id` | ✓ | — | ✓ | — |
| 21 | `PATCH /api/outlets/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 22 | `DELETE /api/outlets/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 23 | `GET /api/terminals` | ✓ | — | ✓ | — |
| 24 | `POST /api/terminals` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 25 | `GET /api/terminals/:id` | ✓ | — | ✓ | — |
| 26 | `PATCH /api/terminals/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 27 | `DELETE /api/terminals/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 28 | `GET /api/tables` | ✓ | — | ✓ | — |
| 29 | `POST /api/tables` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 30 | `PATCH /api/tables/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 31 | `GET /api/rooms` | ✓ | — | ✓ | — |
| 32 | `POST /api/rooms` | ✓ | `rooms_edit` | ✓ | — |
| 33 | `PATCH /api/rooms/:id` | ✓ | `rooms_edit` | ✓ | — |
| 34 | `GET /api/room-types` | ✓ | — | ✓ | — |
| 35 | `POST /api/room-types` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 36 | `GET /api/room-types/:id` | ✓ | — | ✓ | — |
| 37 | `PATCH /api/room-types/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 38 | `DELETE /api/room-types/:id` | ✓ | **`users_manage`** | ✓ | **B39-07** |
| 39 | `GET /api/reservations` | ✓ | — | ✓ | — |
| 40 | `POST /api/reservations` | ✓ | `reservations_create` | ✓ | **B39-08** |
| 41 | `GET /api/reservations/:id` | ✓ | — | ✓ | — |
| 42 | `PATCH /api/reservations/:id` | ✓ | `reservations_edit` | ✓ | **B39-08** |
| 43 | `GET /api/guests` | ✓ | `guests_view` | ✓ | — |
| 44 | `POST /api/guests` | ✓ | `guests_edit` | ✓ | — |
| 45 | `GET /api/guests/:id` | ✓ | `guests_view` | ✓ | — |
| 46 | `PATCH /api/guests/:id` | ✓ | `guests_edit` | ✓ | — |
| 47 | `GET /api/guest-portal/reservations` | ✓ | `guests_view` | ✓ | — |
| 48 | `GET /api/guest-portal/folios` | ✓ | `guests_view` | ✓ | — |
| 49 | `GET /api/loyalty/account` | ✓ | `guests_view` | ✓ | — |
| 50 | `POST /api/loyalty/points` | ✓ | `guests_edit` | ✓ | — |
| 51 | `GET /api/folios` | ✓ | `folios_view` | ✓ | — |
| 52 | `GET /api/folios/:id` | ✓ | `folios_view` | ✓ | — |
| 53 | `POST /api/folios/:id/transactions` | ✓ | `folios_edit` | ✓ | — |
| 54 | `POST /api/folios/:id/close` | ✓ | `folios_edit` | ✓ | — |
| 55 | `GET /api/orders` | ✓ | `orders_view` | ✓ | — |
| 56 | `POST /api/orders` | ✓ | `orders_create` | ✓ | — |
| 57 | `GET /api/orders/:id` | ✓ | `orders_view` | ✓ | — |
| 58 | `PATCH /api/orders/:id/status` | ✓ | `orders_edit` | ✓ | — |
| 59 | `POST /api/orders/:id/items` | ✓ | `orders_edit` | ✓ | **B39-08** |
| 60 | `POST /api/orders/:id/pay` | ✓ | `payments_process` | ✓ | — |
| 61 | `GET /api/online-orders` | ✓ | `orders_view` | ✓ | — |
| 62 | `POST /api/online-orders` | ✓ | `orders_create` | ✓ | **B39-08** |
| 63 | `GET /api/menus` | ✓ | — | ✓ | **B39-09** |
| 64 | `POST /api/menus` | ✓ | `menu_manage` | ✓ | **B39-09** |
| 65 | `GET /api/products` | ✓ | — | ✓ | **B39-09** |
| 66 | `POST /api/products` | ✓ | `menu_manage` | ✓ | **B39-09** |
| 67 | `GET /api/inventory` | ✓ | `inventory_view` | ✓ | — |
| 68 | `POST /api/inventory` | ✓ | `inventory_adjust` | ✓ | — |
| 69 | `GET /api/inventory/movements` | ✓ | `inventory_view` | ✓ | — |
| 70 | `POST /api/inventory/movements` | ✓ | `inventory_adjust` | ✓ | — |
| 71 | `GET /api/suppliers` | ✓ | `procurement_view` | ✓ | — |
| 72 | `POST /api/suppliers` | ✓ | `procurement_edit` | ✓ | — |
| 73 | `GET /api/suppliers/:id` | ✓ | `procurement_view` | ✓ | — |
| 74 | `PATCH /api/suppliers/:id` | ✓ | `procurement_edit` | ✓ | — |
| 75 | `DELETE /api/suppliers/:id` | ✓ | `procurement_edit` | ✓ | — |
| 76 | `GET /api/purchase-orders` | ✓ | `procurement_view` | ✓ | — |
| 77 | `POST /api/purchase-orders` | ✓ | `procurement_edit` | ✓ | — |
| 78 | `GET /api/purchase-orders/:id` | ✓ | `procurement_view` | ✓ | — |
| 79 | `PATCH /api/purchase-orders/:id` | ✓ | `procurement_edit` | ✓ | — |
| 80 | `DELETE /api/purchase-orders/:id` | ✓ | `procurement_edit` | ✓ | — |
| 81 | `GET /api/housekeeping` | ✓ | `housekeeping_view` | ✓ | — |
| 82 | `POST /api/housekeeping` | ✓ | `housekeeping_edit` | ✓ | **B39-08**, **B39-11** |
| 83 | `PATCH /api/housekeeping/:id` | ✓ | `housekeeping_edit` | ✓ | **B39-08**, **B39-11** |
| 84 | `GET /api/maintenance` | ✓ | `maintenance_view` | ✓ | — |
| 85 | `POST /api/maintenance` | ✓ | `maintenance_edit` | ✓ | **B39-08**, **B39-11** |
| 86 | `PATCH /api/maintenance/:id` | ✓ | `maintenance_edit` | ✓ | **B39-08**, **B39-11** |
| 87 | `GET /api/shifts` | ✓ | `shifts_view` | ✓ | — |
| 88 | `POST /api/shifts/open` | ✓ | — (by design) | ✓ | — |
| 89 | `POST /api/shifts/:id/close` | ✓ | — (by design) | ✓ | **B39-02** |
| 90 | `GET /api/reports/sales` | ✓ | `reports_view` | ✓ | **B39-01**, **B39-12** |
| 91 | `GET /api/reports/occupancy` | ✓ | `reports_view` | ✓ | **B39-12** |
| 92 | `GET /api/ai/insights` | ✓ | `reports_view` | ✓ | — |
| 93 | `GET /api/payments` | ✓ | `payments_process` | ✓ | — |
| 94 | `GET /api/payments/:id` | ✓ | `payments_process` | ✓ | — |
| 95 | `PATCH /api/payments/:id` | ✓ | `payments_process` | — | `501`, fail-closed |
| 96 | `DELETE /api/payments/:id` | ✓ | `payments_process` | — | `501`, fail-closed |
| 97 | `POST /api/payments/initiate` | ✓ | `payments_process` | ✓ | — |
| 98 | `POST /api/payments/verify` | ✓ | `payments_process` | ✓ | — |
| 99 | `POST /api/payments/refund` | ✓ | `payments_refund` | ✓ | **B39-13** |
| 100 | `POST /api/payments/webhook/mpesa` | — | optional secret | derived | **B39-03**, **B39-05** |
| 101 | `POST /api/payments/webhook/stripe` | — | Stripe signature | derived | **B39-03** |
| 102 | `POST /api/qr/generate` | ✓ | — | ✓ | **B39-10** |
| 103 | `GET /api/qr/lookup/:token` | — | token + expiry | token-bound | **B39-10** |
| 104 | `POST /api/qr/orders` | — | token + expiry | token-bound | **B39-10** |
| 105 | `POST /api/admin/backups` | ✓ | `finance_edit` | n/a (ops) | — |
| 106 | `GET /api/admin/backups` | ✓ | `finance_edit` | n/a (ops) | LOW-02 |
| 107 | `GET /api/admin/backups/:id/verify` | ✓ | `finance_edit` | contained | **B39-06** |
| 108 | `POST /api/admin/backups/restore-test` | ✓ | `finance_edit` | contained | **B39-06**, LOW-01 |
| 109 | `POST /api/admin/backups/retention-run` | ✓ | `finance_edit` | n/a (ops) | — |

**Public surface after B39:** exactly **5** endpoints are reachable without a
staff token — `GET /health`, `GET /api/qr/lookup/:token`, `POST /api/qr/orders`,
and the two provider callbacks `POST /api/payments/webhook/mpesa` and
`POST /api/payments/webhook/stripe`. `publicEndpoints.security.test.ts` asserts
this positively by requiring `401` from 31 staff endpoints and by proving the QR
and webhook surfaces cannot cross a tenant boundary.

---

## 6. Domain results

Each domain below is the mission's required reporting section. "Result" means the
domain's controls were verified by passing permanent tests, not merely reviewed.

| Domain | Result | Evidence / notes |
| --- | --- | --- |
| **Authentication** | PASS | Cases A–G all enforced: missing, invalid, malformed, expired, wrong-type, refresh-as-access and deactivated tokens answer `401`; a valid token works. `authMiddleware` re-reads user, role and organization from the database, so tenant and permission context is never client-assertable. **B39-16** fixed soft-delete revocation. 266 tests. |
| **Authorization** | PASS | Every write verb is gated by an explicit permission; every tenant-scoped controller anchors its `where` clause to `req.user.organizationId`. 95 RBAC + 161 tenant-isolation tests. |
| **RBAC** | PASS | 16 seeded role families exercised. **B39-07** added the missing gates on outlets, terminals, tables and room types. No permission inheritance across organizations. Structural *reads* deliberately stay authenticated-and-tenant-scoped rather than permission-gated (a waiter must be able to read tables). |
| **Tenant isolation** | PASS | Two full organizations built from equivalent fixtures with dynamic ids. 161 cases across every resource, plus nested-reference cases. 40 of them were proven to fail against the unpatched source. B37.2 inventory boundaries re-verified and not regressed. |
| **IDOR / resource ownership** | PASS | Cross-tenant `GET`/`PATCH`/`DELETE`/child-create/status-change attempts on every `:id` route answer `403`/`404`, and each negative test asserts no state changed. 50 dedicated cases. |
| **Privilege escalation** | PASS | **B39-04** blocked self role change, self-deactivation and self-delete, and restricted `SUPER_ADMIN` grants to an existing super admin. 23 cases, each also asserting the audit event. |
| **Mass assignment** | PASS | No controller passes `req.body` wholesale into a Prisma write. **B39-15** closed the one real instance (`OrderPayment.metadata`). `inventoryController` destructures a client `organizationId` but writes `req.user.organizationId` — asserted positively by test. |
| **Public endpoints** | PASS | Exactly 5 endpoints are unauthenticated, all intentional. `GET /health` leaks no connection string. Guest portal requires `guests_view` and is tenant-scoped. QR and online ordering are token/outlet-bound with server-side pricing. |
| **Payments** | PASS | Tenant-scoped reads, verify, initiate and refund; refund bounded by remaining refundable amount and by `COMPLETED` status. **B39-13** (negative amount → `400`) and **B39-15** (reserved-metadata anchoring) fixed. Idempotency preserved and asserted. No real money moved. |
| **Webhooks** | PASS | A callback resolves a payment **only** through provider identifiers HOSPIFLOW stored; tenant context is derived from the resolved payment; callback amount is compared before settlement; terminal payments are never re-transitioned. **B39-05** adds optional shared-secret verification. |
| **Reporting** | PASS | **B39-01** fixed the critical unscoped sales aggregation. Date parameters validated; inverted ranges rejected. Occupancy is property- and organization-scoped. Client filters cannot override authenticated tenant scope. |
| **Backups** | PASS | **B39-06** contained both restore-engine paths inside `BACKUP_DIR`. 36 cases including 15 hostile references and post-rejection data-integrity assertions. No test performs a real restore. |
| **Audit logs** | PASS (with a documented gap) | All 12 sensitive-action types are written, tenant-scoped from `req.user.organizationId`, and no audit metadata carries a secret. **Gap:** there is no API route that *reads* audit logs, so cross-tenant audit-log disclosure is not reachable; if such a route is added it must be organization-scoped by default. |
| **Rate limiting** | PASS | General `/api/` limiter and the dedicated login brute-force limiter both operational. The login limiter is independent of the general budget, so raising test budgets cannot weaken it; its failure accounting is asserted directly. Production defaults remain 10 failures / 15 minutes. |
| **Input validation** | PASS | **B39-12**, **B39-13** and **B39-17** removed the unhandled-`500` paths. A hostile-input suite (43 cases) proves `400`/`404` — never `500` — for malformed ids, type confusion, negative and non-numeric money, oversized bodies and hostile pagination across 16 endpoints. |

---

## 7. Regression suites added

| Suite | Tests | Covers |
| --- | ---: | --- |
| `tests/integration/authentication.security.test.ts` | 266 | Token handling, expiry, revocation, soft-delete revocation, logout, secret hygiene, limiter accounting |
| `tests/integration/tenantIsolation.security.test.ts` | 161 | Cross-tenant read/write/IDOR across every resource, nested references, reports |
| `tests/integration/rbac.security.test.ts` | 95 | Permission matrix, no cross-org permission inheritance, structural write gates |
| `tests/integration/resourceOwnership.security.test.ts` | 50 | Staff assignment boundaries, malformed and non-existent identifiers, ownership |
| `tests/integration/inputValidation.security.test.ts` | 43 | Hostile financial input, pagination bounds on every paginated endpoint, hostile identifiers and oversized bodies |
| `tests/integration/paymentSecurity.security.test.ts` | 38 | Payment tenancy, refund integrity, webhook forgery/replay/amount tampering, reserved-metadata anchoring, idempotency |
| `tests/integration/backupSecurity.security.test.ts` | 36 | Permission boundary, path containment, restore-engine reachability, secret hygiene |
| `tests/integration/reportSecurity.security.test.ts` | 30 | Report tenancy, hostile parameters, pagination bounds, input validation |
| `tests/integration/privilegeEscalation.security.test.ts` | 23 | Self role change, self-deactivation, self-delete, super-admin grants, audit events |
| `tests/integration/publicEndpoints.security.test.ts` | 23 | The intended public surface, guest portal, QR ordering, online ordering |
| **Total** | **765** | |
| Helper: `tests/integration/helpers/securityFixtures.ts` | — | Two full organizations with dynamic IDs (never hardcoded), plus per-role users |

All fixtures are created with dynamic identifiers; no test hardcodes a database
id, and no test touches the development database.

---

## 8. Validation results

| Gate | Command | Result |
| --- | --- | --- |
| API test suite | `npm test` | **912 passed / 912** (36 files) |
| B39 security suites | `npx vitest run tests/integration/*.security.test.ts` | **765 passed / 765** (10 files) |
| B36 acceptance | `npx tsx scripts/b36-validation.ts` | **141 PASS / 0 FAIL / 0 WARN** |
| B38 infrastructure | `scripts/b38-validation.sh` | **9 PASS / 0 FAIL / 0 WARN** |
| Typecheck (api, web, worker) | `npm run typecheck` | clean |
| Lint (api src, web, worker) | `npm run lint` | clean |
| Build (all workspaces) | `npm run build` | clean |
| E2E | `npx playwright test` | **1 passed / 1** |
| Database isolation | B38 steps 1 + 6 | test DB is `hospiflow_test`; development DB byte-for-byte unchanged |
| Secret scan of tracked files | `git ls-files \| xargs grep` | clean (see B39-18) |

The B36 run was executed against a live API server built from the **final**
hardened tree, with `PAYMENT_PROVIDER=mock` and the development database seeded,
so the 141 passes are evidence about the shipped code rather than about a
pre-hardening build.

Baseline for comparison: the pre-B39 API suite was `26 files / 147 tests`. The
B39 suites added 10 files and 765 tests (147 + 765 = 912; 26 + 10 = 36). No
pre-existing test case was modified, deleted or weakened; only shared test
configuration and helper request budgets were raised, and the login limiter's
production behaviour is verified independently of those budgets.

### Regression gates that B38 owns, confirmed

- **Test database isolation:** `DATABASE_TEST_URL` resolves to `hospiflow_test`,
  refuses to run when absent or when it resolves to `hospiflow`, and is asserted
  separate from `DATABASE_URL` before any destructive command.
- **Redis / BullMQ:** Redis reported `PONG`; the BullMQ suite passes; no queue,
  repeatable job or backup-worker behaviour was removed.
- **Development database:** fingerprinted before and after the full suite by
  `scripts/b38-validation.sh` and reported byte-for-byte unchanged.

---

## 9. Deployment requirements

These are **not** optional for a production rollout of this milestone:

1. **Set `MPESA_WEBHOOK_SECRET`** and restrict `/api/payments/webhook/*` at the
   proxy or allow-list. Without the secret the M-Pesa callback endpoint is
   unauthenticated (it still cannot settle an arbitrary payment — see B39-03 —
   but the endpoint itself is open). See B39-INFO / B39-05.
2. **Set `BACKUP_DIR` explicitly** to a dedicated directory outside any
   web-served path. `resolveBackupPath` containment is relative to this value.
3. **Do not grant `finance_edit` to a non-admin role**, or
   `POST /api/admin/backups/restore-test` becomes reachable by that role (LOW-01).
4. **`AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS`** should be left at their
   defaults (10 failures per 15 minutes) in production. They are only raised in
   the test and development environments.
5. The web front end must treat the new `403` responses on
   `POST/PATCH/DELETE /api/outlets`, `/api/terminals`, `/api/tables` and
   `/api/room-types` as expected for non-administrator roles (B39-07).
6. **Do not grant `payments_process` to a low-trust role**, because
   `GET /api/payments` returns provider `clientSecret` values (B39-LOW-03).
7. **Delete `apps/api/src/controllers/org-test-copy.ts`** before it is imported
   by anything. It is dead code today, but it exports the pre-fix unscoped
   organization handlers (B39-INFO-02).

---

## 10. Files changed

**Security fixes (source):**
`app.ts`, `config/index.ts`, `utils/pagination.ts`,
`controllers/{reports,shifts,housekeeping,maintenance,menus,products,onlineOrders,qr,organizations,folios,reservations,orders,users}Controller.ts`,
`routes/{outlets,terminals,tables,roomTypes,ai,backups,folios,guests,housekeeping,inventory,maintenance,menus,onlineOrders,orders,products,purchaseOrders,reports,reservations,rooms,shifts,suppliers,payments}.ts`,
`services/backupService.ts`, `services/paymentService.ts`, `services/payments/mpesa.ts`,
`middleware/auth.ts`,
**new** `services/paymentWebhookService.ts`.

**Tests:** 10 new suites plus `tests/integration/helpers/securityFixtures.ts`.
**Configuration:** `.env.example`, `vitest.workspace.ts`, `apps/api/vitest.config.ts`,
`tests/integration/helpers/testEnv.ts`, `TESTING.md`, `scripts/health-check.sh`
(B39-18).

No Prisma schema change. No migration. No change to `apps/web` or `apps/worker`
behaviour.

**Database changes**

```
Schema changed: NO
Migrations added: NO
```

---

## 11. Credential rotation required

B39-18 removed a live `REDIS_PASSWORD` from `scripts/health-check.sh`, but the
value had already been committed. **Treat it as disclosed and rotate it.**
Removing it from the working tree does not remove it from git history, so
rotation — not deletion — is the actual remediation. Rotate it in Redis and in
`.env`/`docker-compose`, and force-push a history rewrite only if repository
policy requires it. The same review should be applied to any other credential
that has ever been committed.

No real secret value is reproduced anywhere in this report.

---

## 12. Final security assessment

Every route in the 109-endpoint surface is inventoried and covered by at least
one permanent test. Authentication, RBAC, tenant isolation, resource ownership,
nested-resource ownership, IDOR, privilege escalation, mass assignment, payment
settlement, webhook authentication, report scoping, backup containment, audit-log
scoping and input validation are all enforced by server-side checks and covered
by tests that were demonstrated to fail against the unfixed code.

The API is in a defensible state for the controls this milestone covers. Three
items remain open **by design and by documentation**, and none of them is an
unresolved code defect:

1. `MPESA_WEBHOOK_SECRET` is optional. Until it is set, the M-Pesa callback
   endpoint is unauthenticated at the transport level. The settlement path itself
   is now closed (B39-03 + B39-15), so an unauthenticated callback can no longer
   settle a chosen payment — but the endpoint should still be firewalled.
2. Access tokens are not revoked by logout; only account deletion and
   deactivation are immediately effective (B39-16). True revocation needs a
   token denylist, which would be an authentication redesign.
3. The Redis credential committed before B39 must be rotated  (§11).

Subject to those three deployment actions, B39 is **COMPLETE**. This report does
not assert that the system is production-ready in every respect — only that the
B39 security gates pass and that the confirmed findings above are fixed and
covered.
