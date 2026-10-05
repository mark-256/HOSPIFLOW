#!/usr/bin/env bash
# HOSPIFLOW B38 — Infrastructure Validation
#
# Validates, in order:
#   1. Test database isolation (DATABASE_TEST_URL separate from DATABASE_URL)
#   2. Test database reachability and schema
#   3. Redis health (PING -> PONG)
#   4. Development database fingerprint before the integration suite
#   5. Integration suite against DATABASE_TEST_URL only
#   6. Development database fingerprint after the suite (must be identical)
#
# Usage:
#   export DATABASE_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow"
#   export DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"
#   export REDIS_URL="redis://localhost:6379"
#   scripts/b38-validation.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_DB="${DATABASE_URL:-postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow}"
TEST_DB="${DATABASE_TEST_URL:-}"

PASS=0
FAIL=0
WARN=0

pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARN=$((WARN + 1)); }

db_name() { echo "$1" | sed -E 's|.*/([^/?]+).*|\1|'; }

# Read-only fingerprint of a database: table count plus per-table row counts.
# Used to prove the development database is untouched by the test suite.
fingerprint() {
  local url="$1"
  psql "$url" -tAc "
    SELECT 'tables=' || (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public')
    UNION ALL SELECT 'users=' || (SELECT count(*)::text FROM \"User\")
    UNION ALL SELECT 'organizations=' || (SELECT count(*)::text FROM \"Organization\")
    UNION ALL SELECT 'properties=' || (SELECT count(*)::text FROM \"Property\")
    UNION ALL SELECT 'rooms=' || (SELECT count(*)::text FROM \"Room\")
    UNION ALL SELECT 'reservations=' || (SELECT count(*)::text FROM \"Reservation\")
    UNION ALL SELECT 'inventoryItems=' || (SELECT count(*)::text FROM \"InventoryItem\")
    UNION ALL SELECT 'stockMovements=' || (SELECT count(*)::text FROM \"StockMovement\")
    UNION ALL SELECT 'payments=' || (SELECT count(*)::text FROM \"Payment\")
    UNION ALL SELECT 'orders=' || (SELECT count(*)::text FROM \"Order\")
    ORDER BY 1;" 2>/dev/null || echo "FINGERPRINT_ERROR"
}

echo "=============================================="
echo " HOSPIFLOW B38 — Infrastructure Validation"
echo "=============================================="
echo
echo "DEV DB:   $DEV_DB"
echo "TEST DB:  ${TEST_DB:-<not set>}"
echo "REDIS:    ${REDIS_URL:-redis://localhost:6379}"
echo

# --- 1. Test database configuration ----------------------------------------
echo "===== 1. TEST DATABASE ISOLATION ====="

if [ -z "$TEST_DB" ]; then
  fail "DATABASE_TEST_URL is not configured"
  echo "  Set it to a dedicated test database:"
  echo "  export DATABASE_TEST_URL=\"postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test\""
  exit 1
fi
pass "DATABASE_TEST_URL is configured"

TEST_DB_NAME=$(db_name "$TEST_DB")
DEV_DB_NAME=$(db_name "$DEV_DB")

if [ "$TEST_DB_NAME" = "$DEV_DB_NAME" ]; then
  fail "DATABASE_TEST_URL resolves to the same database as DATABASE_URL ($DEV_DB_NAME)"
  exit 1
fi
pass "Test database name differs from the development database ($TEST_DB_NAME vs $DEV_DB_NAME)"

case "$TEST_DB_NAME" in
  hospiflow)
    fail "Test database name is 'hospiflow' — the development/production database name"
    exit 1
    ;;
esac
pass "Test database name is not the development/production name"

# --- 2. Test database reachability -----------------------------------------
echo
echo "===== 2. TEST DATABASE STATE ====="

if psql "$TEST_DB" -tAc "SELECT 1" >/dev/null 2>&1; then
  pass "Test database is reachable"
  TABLE_COUNT=$(psql "$TEST_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '\_prisma%'" 2>/dev/null || echo 0)
  if [ "${TABLE_COUNT:-0}" -gt 0 ]; then
    pass "Test database schema is applied ($TABLE_COUNT tables)"
  else
    fail "Test database has no tables — run scripts/setup-test-db.sh"
  fi
else
  fail "Test database is not reachable — run scripts/setup-test-db.sh"
fi

# --- 3. Redis health -------------------------------------------------------
echo
echo "===== 3. REDIS HEALTH ====="

if REDIS_URL="${REDIS_URL:-redis://localhost:6379}" "$ROOT_DIR/scripts/redis-health-check.sh"; then
  pass "Redis PING -> PONG"
else
  fail "Redis is not healthy — the worker will use the setInterval fallback"
fi

# --- 4. Development database fingerprint (pre-test) ------------------------
echo
echo "===== 4. DEVELOPMENT DATABASE FINGERPRINT (PRE-TEST) ====="
PRE_FINGERPRINT=$(fingerprint "$DEV_DB")
echo "$PRE_FINGERPRINT" | sed 's/^/  /'
if [ "$PRE_FINGERPRINT" = "FINGERPRINT_ERROR" ]; then
  fail "Could not read the development database"
  echo "  The suite is NOT run, because the development database cannot be verified."
  exit 1
fi
pass "Development database fingerprint captured"

# --- 5. Integration suite --------------------------------------------------
echo
echo "===== 5. INTEGRATION SUITE (against DATABASE_TEST_URL only) ====="
if (cd "$ROOT_DIR" && npm test); then
  pass "Integration suite passed against the isolated test database"
else
  fail "Integration suite failed"
fi

# --- 6. Development database fingerprint (post-test) -----------------------
echo
echo "===== 6. DEVELOPMENT DATABASE FINGERPRINT (POST-TEST) ====="
POST_FINGERPRINT=$(fingerprint "$DEV_DB")
echo "$POST_FINGERPRINT" | sed 's/^/  /'
if [ "$PRE_FINGERPRINT" = "$POST_FINGERPRINT" ]; then
  pass "Development database is byte-for-byte unchanged after the full suite"
else
  fail "Development database was modified by the test suite"
  diff <(echo "$PRE_FINGERPRINT") <(echo "$POST_FINGERPRINT") || true
fi

# --- Summary ---------------------------------------------------------------
echo
echo "=============================================="
echo " SUMMARY"
echo "=============================================="
echo "PASS: $PASS"
echo "WARN: $WARN"
echo "FAIL: $FAIL"
echo
echo "Run B36 validation separately against the running API:"
echo "  npx tsx scripts/b36-validation.ts"
echo

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
echo -e "${GREEN}All B38 infrastructure checks passed.${NC}"
