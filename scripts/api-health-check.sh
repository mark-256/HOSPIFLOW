#!/usr/bin/env bash
# HOSPIFLOW AUTHENTICATED API HEALTH CHECK
# Tests all protected API endpoints with a valid token
set -u

API_URL="${API_URL:-http://localhost:3001}"
EMAIL="${HOSPIFLOW_TEST_EMAIL:-admin@hospiflow.com}"
PASSWORD="${HOSPIFLOW_TEST_PASSWORD:-admin123}"

PASS=0
FAIL=0
WARN=0

echo "=============================================="
echo " HOSPIFLOW AUTHENTICATED API HEALTH CHECK"
echo "=============================================="
echo
echo "API: $API_URL"
echo

# Login and extract token
LOGIN_RESPONSE=$(curl -sS --max-time 15 \
  -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null || true)

if [ -z "$LOGIN_RESPONSE" ]; then
  echo "[FAIL] Authentication request failed"
  exit 1
fi

TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | node -e '
let data="";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
try {
  const json = JSON.parse(data);
  process.stdout.write(json?.data?.token || "");
} catch {
  process.stdout.write("");
}
});
')

if [ -z "$TOKEN" ]; then
  echo "[FAIL] Login succeeded without receiving an access token"
  echo
  echo "Login response:"
  printf '%s\n' "$LOGIN_RESPONSE"
  exit 1
fi

echo "[PASS] POST /api/auth/login"
PASS=$((PASS + 1))

# Test /me
ME_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  --max-time 15 \
  "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
if [ "$ME_STATUS" = "200" ]; then
  echo "[PASS] GET /api/auth/me -> 200"
  PASS=$((PASS + 1))
else
  echo "[FAIL] GET /api/auth/me -> $ME_STATUS"
  FAIL=$((FAIL + 1))
fi

# Test logout
LOGOUT_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" \
  --max-time 15 \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/auth/logout" 2>/dev/null || echo "000")
if [ "$LOGOUT_STATUS" = "200" ]; then
  echo "[PASS] POST /api/auth/logout -> 200"
  PASS=$((PASS + 1))
else
  echo "[FAIL] POST /api/auth/logout -> $LOGOUT_STATUS"
  FAIL=$((FAIL + 1))
fi

echo
echo "===== PROTECTED API ENDPOINTS ====="

test_endpoint() {
  local method="$1"
  local path="$2"

  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    -X "$method" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "$API_URL$path" 2>/dev/null || echo "000")

  case "$status" in
    2[0-9][0-9])
      echo "[PASS] $method $path -> $status"
      PASS=$((PASS + 1))
      ;;
    401)
      echo "[FAIL] $method $path -> 401 Unauthorized"
      FAIL=$((FAIL + 1))
      ;;
    403)
      echo "[WARN] $method $path -> 403 Forbidden"
      WARN=$((WARN + 1))
      ;;
    404)
      echo "[WARN] $method $path -> 404 Not Found"
      WARN=$((WARN + 1))
      ;;
    429)
      echo "[WARN] $method $path -> 429 Rate Limited"
      WARN=$((WARN + 1))
      ;;
    5[0-9][0-9])
      echo "[FAIL] $method $path -> $status"
      FAIL=$((FAIL + 1))
      ;;
    *)
      echo "[FAIL] $method $path -> $status"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# Hotel / Front Office
test_endpoint GET "/api/properties"
test_endpoint GET "/api/rooms?limit=10"
test_endpoint GET "/api/reservations?limit=10"
test_endpoint GET "/api/guests?limit=10"
test_endpoint GET "/api/folios?limit=10"

# Restaurant / POS
test_endpoint GET "/api/orders?limit=10"

# Inventory
test_endpoint GET "/api/inventory"

# Housekeeping
test_endpoint GET "/api/housekeeping"

# Maintenance
test_endpoint GET "/api/maintenance"

# Finance
test_endpoint GET "/api/payments"
test_endpoint GET "/api/finance"

# Procurement
test_endpoint GET "/api/suppliers"
test_endpoint GET "/api/purchase-orders"

# Additional modules
test_endpoint GET "/api/tables"
test_endpoint GET "/api/menus"
test_endpoint GET "/api/products"
test_endpoint GET "/api/inventory/movements"
test_endpoint GET "/api/reports/sales"
test_endpoint GET "/api/reports/occupancy"
test_endpoint GET "/api/online-orders"
test_endpoint GET "/api/loyalty/account?guestId=dummy"
test_endpoint GET "/api/guest-portal/reservations?guestId=dummy"
test_endpoint GET "/api/guest-portal/folios?guestId=dummy"
test_endpoint GET "/api/shifts"
test_endpoint GET "/api/users"
test_endpoint GET "/api/organizations"
test_endpoint GET "/api/outlets"
test_endpoint GET "/api/terminals"
test_endpoint GET "/api/ai/insights"
test_endpoint GET "/api/admin/backups"

echo
echo "===== UNAUTHENTICATED ACCESS TESTS ====="

test_unauth() {
  local path="$1"
  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    -X GET \
    "$API_URL$path" 2>/dev/null || echo "000")

  case "$status" in
    401)
      echo "[PASS] (no auth) GET $path -> 401"
      PASS=$((PASS + 1))
      ;;
    *)
      echo "[FAIL] (no auth) GET $path -> $status (expected 401)"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

test_unauth "/api/properties"
test_unauth "/api/guests"
test_unauth "/api/rooms?limit=10"
test_unauth "/api/orders?limit=10"
test_unauth "/api/payments"

echo
echo "===== INVALID TOKEN TESTS ====="

test_invalid_token() {
  local path="$1"
  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    -X GET \
    -H "Authorization: Bearer invalid.token.here" \
    "$API_URL$path" 2>/dev/null || echo "000")

  case "$status" in
    401|403)
      echo "[PASS] (invalid token) GET $path -> $status"
      PASS=$((PASS + 1))
      ;;
    *)
      echo "[FAIL] (invalid token) GET $path -> $status (expected 401 or 403)"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

test_invalid_token "/api/properties"
test_invalid_token "/api/guests"

echo
echo "=============================================="
echo " SUMMARY"
echo "=============================================="
echo "PASS: $PASS"
echo "WARN: $WARN"
echo "FAIL: $FAIL"
echo

if [ "$FAIL" -gt 0 ]; then
  echo "[RESULT] API HAS FAILURES"
  exit 1
fi

if [ "$WARN" -gt 0 ]; then
  echo "[RESULT] API HEALTH PASSED WITH WARNINGS"
  exit 0
fi

echo "[RESULT] ALL TESTED APIS PASSED"
exit 0
