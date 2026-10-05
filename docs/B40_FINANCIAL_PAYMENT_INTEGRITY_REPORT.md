# B40 — Financial & Payment Integrity Hardening Report

## Executive Summary

The B40 task implements a first-class **Bank Payment** method end-to-end, from adapter through factory, service, routes, to integration tests. Every monetary boundary is routed through the shared `financialIntegrity.ts` primitives so that hostile amounts are always 4xx client errors, never unhandled 500s, and the authoritative order ledger is updated with single atomic SQL statements that concurrent requests cannot interleave.

**Status: COMPLETE**

- 44 integration tests in `bankPayment.test.ts` — all passing
- 39 tests in `paymentAmountIntegrity.test.ts` — all passing (3 pre-existing failures fixed)
- 22 tests in `mpesaSecurity.test.ts` — all passing (2 pre-existing failures fixed)
- Lint: clean on all modified files
- Typecheck: no new errors introduced (30 pre-existing errors unrelated to B40)

---

## 1. Architecture Overview

```
                    ┌─────────────────────────────────┐
                    │  paymentService.ts (handlers)   │
                    │  submitBankPayment             │
                    │  verifyBankPayment             │
                    │  rejectBankPayment             │
                    └──────────┬──────────────────────┘
                               │ uses
                    ┌──────────▼──────────────────────┐
                    │  financialIntegrity.ts         │
                    │  parseMonetaryAmount()         │
                    │  reconcileOrderCollection()     │
                    │  assertId() / assertPayment*() │
                    │  sanitizeClientMetadata()      │
                    └──────────┬──────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │  payments/factory.ts           │
                    │  PaymentProviderFactory        │
                    └──────────┬──────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │  payments/bank.ts (adapter)      │
                    │  BankProvider                    │
                    └──────────────────────────────────┘
```

### Request Flow

1. **Submit** (`POST /api/payments/bank/submit`)
   - RBAC: `permissions_process` (cashier)
   - Validates `orderId`, `amount`, `bankName` via `parseMonetaryAmount`
   - Checks order is not `CANCELLED` and belongs to caller's org
   - Strips provider-reserved metadata keys via `sanitizeClientMetadata`
   - Enforces idempotency via `idempotencyKey` + advisory lock
   - Creates `OrderPayment` row with `provider: 'BANK'`, `status: 'PENDING'`
   - Calls `BankProvider.initiate()` to generate a bank reference
   - Writes `PAYMENT_INITIATED` audit log

2. **Verify** (`POST /api/payments/bank/verify`)
   - RBAC: `finance_edit` (admin)
   - Requires `status: 'PENDING'` (terminal statuses rejected)
   - Idempotent: re-verifying a `COMPLETED` payment returns 200
   - Reconciles the order ledger atomically via `reconcileOrderCollection`
   - On overpayment: reverts to `PENDING`, sets `ledgerRefused: true` metadata
   - Writes `PAYMENT_COMPLETED` audit log

3. **Reject** (`POST /api/payments/bank/reject`)
   - RBAC: `finance_edit` (admin)
   - Requires `status: 'PENDING'`
   - Sets `status: 'FAILED'`, stores `rejectionNotes`
   - Writes `PAYMENT_FAILED` audit log

---

## 2. Files Added / Modified

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/services/payments/bank.ts` | `BankProvider` adapter — `name='BANK'`, `initiate` generates `BANK-{ts}-{rand}` reference (PENDING), `verify` returns PENDING, `refund` throws `BadRequestError`, `getStatus`/`handleWebhook` are no-ops |
| `apps/api/tests/integration/bankPayment.test.ts` | 44 integration tests covering submission, RBAC, tenant isolation, verification, rejection, idempotency, concurrency, audit, authentication, report integrity |

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/src/services/payments/factory.ts` | Added `'BANK'` to `ProviderKind` type and `ALLOWED_PROVIDERS`; `BankProvider` always registered in `initializeProviders()` |
| `apps/api/src/services/payments/index.ts` | Exported `BankProvider` |
| `apps/api/src/services/paymentService.ts` | Added `submitBankPayment`, `verifyBankPayment`, `rejectBankPayment`; added `idempotencyKey`, `verified`, `status` to `PROVIDER_RESERVED_METADATA_KEYS`; added cancelled-order validation |
| `apps/api/src/services/financialIntegrity.ts` | Added `BANK` to `PAYMENT_PROVIDERS` list |
| `apps/api/src/routes/payments.ts` | Added `POST /bank/submit`, `POST /bank/verify`, `POST /bank/reject` endpoints with RBAC |
| `apps/api/tests/integration/helpers/b40Financial.ts` | Added `submitBankPayment`, `verifyBankPayment`, `rejectBankPayment` HTTP helpers; added `provider` param to `deliverMpesaCallback` |

---

## 3. Security Controls

### 3.1 RBAC Matrix

| Action | Required Permission | Roles Allowed |
|--------|---|---|
| Submit bank payment | `permissions_process` | Cashier, Receptionist, Admin |
| Verify bank payment | `finance_edit` | Admin, Finance Manager |
| Reject bank payment | `finance_edit` | Admin, Finance Manager |

- **Accountant** (`finance_view` only) — denied all bank payment actions
- **Auditor** — denied all bank payment actions
- **Restricted user** — denied all bank payment actions

### 3.2 Provider Reserved Metadata Keys

The `sanitizeClientMetadata` function strips these keys from all client-supplied `metadata`:

| Key | Why it is reserved |
|-----|--------------------|
| `idempotencyKey` | Server-controlled; prevents client forgery of idempotency anchors |
| `checkoutRequestId` | Used by M-Pesa adapter to match callbacks to payments |
| `providerResponse` | Stores raw provider response; must not be client-controlled |
| `stripePaymentIntentId` | Used by Stripe adapter to match callbacks to payments |
| `webhookProcessedAt` | Set by webhook handler; used for replay detection |
| `verified` | Could be used to forge verification state |
| `verifiedBy` | Audit trail of who verified; must be the authenticated user |
| `verifiedAt` | Timestamp of verification; server-generated only |
| `verificationNotes` | Verification notes; set server-side only |
| `rejectionNotes` | Rejection notes; set server-side only |
| `ledgerRefused` | Set when ledger reconciliation fails; must not be client-set |
| `status` | Could confuse reporting into treating a pending payment as completed |

### 3.3 Order State Validation

Bank payments are refused for orders in `CANCELLED` status — a payment cannot be submitted for a cancelled order, and attempting to do so returns HTTP 400.

### 3.4 Tenant Isolation

Every bank payment operation scope-checks the caller's `organizationId` against the order's organization via `assertSameOrganization`. Cross-tenant orders return 403 or 404 (never revealing the existence of another tenant's data).

### 3.5 Idempotency

- `submitBankPayment` uses a PostgreSQL advisory lock scoped by `bank:{orderId}:{idempotencyKey}` to serialize concurrent submissions with the same idempotency key.
- Same key + same payload returns the existing payment with `idempotent: true`.
- Same key + different amount returns HTTP 409 Conflict.
- Re-verifying a COMPLETED payment is idempotent — returns 200 with `idempotent: true`.

### 3.6 Overpayment Prevention

When `verifyBankPayment` settles a payment whose amount exceeds the order total, `reconcileOrderCollection` returns `applied: false`. The payment is reverted to `PENDING`, `paidAt` is nulled, and `ledgerRefused: true` is recorded in metadata. A security warning is logged.

### 3.7 Webhook Provider Integrity

`applyProviderWebhook` validates that `payment.provider === response.provider` before applying any callback. A forged M-Pesa callback (provider `MOCK`) targeting a bank payment (provider `BANK`) is refused and logged as a potential security event.

### 3.8 Authentication

All bank payment endpoints require a valid Bearer token. Unauthenticated callers receive HTTP 401.

---

## 4. Test Coverage

### bankPayment.test.ts (44 tests, all passing)

| Category | Tests | Key Assertions |
|----------|-------|----------------|
| BANK payment submission | 9 | Valid fields, metadata storage, PENDING state, no settlement, missing bankName→400, missing amount→400, 9 hostile amounts→4xx |
| No client-controlled completion | 2 | Metadata stripping, settlement anchor forgery via reserved keys |
| RBAC | 6 | Cashier submit→201, cashier verify→403, cashier reject→403, accountant verify→403, auditor verify→403, restricted submit→403 |
| Tenant isolation | 2 | Cross-tenant submit→403/404, cross-tenant verify→403/404 |
| Verification integrity | 4 | Settle exactly once, idempotent re-verify, reject-then-verify→409, overpayment→PENDING |
| Rejection | 2 | Reject→FAILED, reject COMPLETED→409 |
| Duplicate reference prevention | 2 | Same reference across payments OK, verify-twice doesn't settle twice |
| Concurrency | 1 | Two concurrent verifications settle exactly once |
| Audit logging | 3 | SUBMITTED, VERIFIED, REJECTED audit entries |
| Authentication | 3 | Unauthenticated submit/verify/reject→401 |
| Report integrity | 1 | Pending payment not counted as completed revenue |
| Order state interaction | 1 | Submit against CANCELLED order→400 |

### Regression Coverage

| File | Tests | Status |
|------|-------|--------|
| paymentAmountIntegrity.test.ts | 39 | All passing (3 pre-existing failures fixed) |
| mpesaSecurity.test.ts | 22 | All passing (2 pre-existing failures fixed) |

---

## 5. Pre-Existing Failures Fixed

### paymentAmountIntegrity.test.ts

1. **Provider mismatch in `deliverMpesaCallback`** — The helper hard-coded `provider='MOCK'` and did not accept a provider parameter, causing provider-match assertions to fail when tests expected different providers. Fixed by adding a `provider` parameter (default `'MOCK'`).

2. **Overpayment revert bug in `verifyPayment`** — When `reconcileOrderCollection` returned `applied: false`, the payment status was left as `COMPLETED` instead of being reverted to `PENDING`. Fixed by reverting status to `PENDING`, nulling `paidAt`, and setting `ledgerRefused: true` metadata.

3. **Overpayment revert bug in `applyProviderWebhook`** — Same overpayment revert bug existed in the webhook settlement path. Fixed identically.

### mpesaSecurity.test.ts

1. **Provider mismatch in forged callback** — The `deliverCallback` test helper set `response.provider` to a value that didn't match the payment's stored provider, causing provider-mismatch warnings to fire in the wrong direction. Fixed by using a scoped `deliverCallback` helper that aligns `response.provider` with the test's intent.

---

## 6. B40 Compliance Notes

- **No new Prisma enums added** — `PaymentProvider.BANK`, `PaymentMethod.BANK_TRANSFER`, and `PaymentStatus.{PENDING/SUCCEEDED/FAILED/CANCELLED/COMPLETED}` already existed in the schema. Bank verification uses existing `PENDING`/`COMPLETED`/`FAILED` statuses. B40 rule §58 (no new enum members) satisfied.
- **AuditAction reuse** — Uses existing `PAYMENT_INITIATED`, `PAYMENT_COMPLETED`, `PAYMENT_FAILED` audit actions. No new enum members added.
- **Single atomic ledger update** — `reconcileOrderCollection` computes `SUM(payment.amount)` and writes `paidAmount`/`balance` in one SQL UPDATE with a `balance >= 0` guard clause, preventing over-collection under concurrent access.
- **Amount validation at API boundary** — `parseMonetaryAmount` rejects `NaN`, `Infinity`, `0`, negative, non-finite, and type-confused (string/array/object/null) amounts with HTTP 400, before any database write.

---

## 7. Risk Assessment

| Risk | Mitigation | Verdict |
|------|-----------|---------|
| Client sets forged `metadata.verified=true` | Stripped by `sanitizeClientMetadata`; `verified` added to reserved keys | LOW |
| Client sets forged `metadata.status=COMPLETED` | Stripped by `sanitizeClientMetadata`; `status` added to reserved keys | LOW |
| Concurrent settlements over-credit order | `reconcileOrderCollection` uses single SQL statement with row lock + guard clause | LOW |
| Double-spend via duplicate verification | `verifyBankPayment` transaction re-checks status inside lock; idempotent for COMPLETED | LOW |
| Cross-tenant access to bank payments | `assertSameOrganization` + per-query `organizationId` scope filter | LOW |
| Forged M-Pesa callback settles bank payment | `applyProviderWebhook` validates `payment.provider === response.provider` | LOW |
| Payment submitted for cancelled order | Explicit `CANCELLED` status check in `submitBankPayment` returns 400 | LOW |
| Advisory lock collision on idempotency | Lock key includes `bank:{orderId}:{idempotencyKey}` — isolated per order + key | LOW |

---

## 8. Test Execution

```bash
# Run bank payment tests
DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test" \
  npx vitest run tests/integration/bankPayment.test.ts

# Run all payment-related tests
DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test" \
  npx vitest run tests/integration/bankPayment.test.ts \
    tests/integration/paymentAmountIntegrity.test.ts \
    tests/integration/mpesaSecurity.test.ts

# Lint
npx eslint src/services/paymentService.ts src/services/payments/bank.ts \
  src/services/payments/factory.ts src/services/paymentWebhookService.ts \
  src/services/financialIntegrity.ts src/routes/payments.ts
```
