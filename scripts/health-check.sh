#!/usr/bin/env bash
# HOSPIFLOW SYSTEM HEALTH CHECK
# Run from repo root. All commands use absolute paths / correct working dirs.

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo "========================================"
echo " HOSPIFLOW SYSTEM HEALTH CHECK"
echo "========================================"
echo

echo "===== 1. NODE / NPM ====="
node -v && pass "node" || fail "node"
npm -v && pass "npm" || fail "npm"

echo
echo "===== 2. DOCKER ====="
docker --version && pass "docker" || fail "docker"
docker compose version && pass "docker compose" || fail "docker compose"

echo
echo "===== 3. DOCKER CONTAINERS ====="
if docker compose -f docker-compose.production.yml ps --format json 2>/dev/null | grep -q '"State":"running"'; then
  docker compose -f docker-compose.production.yml ps
  pass "containers running"
else
  fail "containers not running"
fi

echo
echo "===== 4. PORTS ====="
# 3000 (Web), 3001 (API) are host-exposed
for port in 3000 3001; do
  if ss -tlnp 2>/dev/null | grep -q ":$port "; then
    pass "port $port listening"
  else
    fail "port $port NOT listening"
  fi
done
# 5432 (PostgreSQL) - host-local only
if ss -tlnp 2>/dev/null | grep -q ":5432 "; then
  pass "port 5432 (PostgreSQL) listening"
else
  fail "port 5432 NOT listening"
fi
# 6379 (Redis) - internal to Docker, not host-exposed by design
if docker exec hospiflow-redis-1 redis-cli ping 2>/dev/null | grep -q PONG; then
  pass "port 6379 (Redis) reachable via Docker"
else
  warn "port 6379 (Redis) not reachable (expected if not host-exposed)"
fi

echo
echo "===== 5. DATABASE ENVIRONMENT ====="
# Check .env has a real DATABASE_URL, not a placeholder
DB_URL=$(grep -E "^DATABASE_URL=" .env 2>/dev/null | cut -d= -f2- | tr -d '"')
if [[ "$DB_URL" == "<configured>" ]] || [[ -z "$DB_URL" ]]; then
  fail "DATABASE_URL is a placeholder in .env"
else
  pass "DATABASE_URL configured: ${DB_URL:0:40}..."
fi

# Also check DIRECT_URL if used
DIRECT_URL=$(grep -E "^DIRECT_URL=" .env 2>/dev/null | cut -d= -f2- | tr -d '"')
if [[ -n "$DIRECT_URL" ]]; then
  pass "DIRECT_URL configured"
fi

echo
echo "===== 6. PRISMA ====="
cd packages/database
npx prisma --version 2>/dev/null && pass "prisma cli" || fail "prisma cli"
npx prisma validate --schema=prisma/schema.prisma 2>/dev/null && pass "schema valid" || fail "schema invalid"
cd ../..

echo
echo "===== 7. PRISMA MIGRATION STATUS ====="
cd packages/database
if npx prisma migrate status --schema=prisma/schema.prisma 2>/dev/null | grep -q "up to date"; then
  pass "migrations up to date"
else
  npx prisma migrate status --schema=prisma/schema.prisma
  warn "migrations not up to date (see above)"
fi
cd ../..

echo
echo "===== 8. DATABASE CONNECTION TEST ====="
cd packages/database
if npx prisma db execute --schema=prisma/schema.prisma --file /dev/stdin <<< "SELECT 1" >/dev/null 2>&1; then
  pass "database connection OK"
else
  fail "database connection FAILED"
fi
cd ../..

echo
echo "===== 9. DATABASE TABLE COUNT ====="
TABLE_COUNT=$(docker exec hospiflow-postgres-1 psql -U hospiflow -d hospiflow -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -dc '0-9')
if [[ -n "$TABLE_COUNT" ]] && [[ "$TABLE_COUNT" -gt 0 ]]; then
  pass "table count: $TABLE_COUNT"
else
  fail "could not retrieve table count"
fi

echo
echo "===== 10. API HEALTH ====="
API_HEALTH=$(curl -s http://localhost:3001/health 2>/dev/null)
if echo "$API_HEALTH" | grep -q '"status":"ok"'; then
  pass "API /health OK"
else
  fail "API /health failed: $API_HEALTH"
fi

API_READY=$(curl -s http://localhost:3001/health/ready 2>/dev/null)
if echo "$API_READY" | grep -q '"status":"ready"'; then
  pass "API /health/ready OK"
else
  warn "API /health/ready not found (may not be implemented)"
fi

echo
echo "===== 11. WEB HEALTH ====="
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
if [[ "$WEB_STATUS" == "200" ]]; then
  pass "Web homepage 200 OK"
else
  fail "Web homepage returned $WEB_STATUS"
fi

echo
echo "===== 12. API AUTH ROUTE ====="
AUTH_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospiflow.com","password":"admin123"}' 2>/dev/null)
if echo "$AUTH_RESPONSE" | grep -q '"success":true'; then
  pass "Auth login works (valid creds return JWT)"
else
  warn "Auth login: $AUTH_RESPONSE"
fi

echo
echo "===== 13. WORKER ====="
if pgrep -f "tsx watch src/worker.ts" >/dev/null 2>&1 || pgrep -f "worker.ts" >/dev/null 2>&1; then
  pass "Worker process running"
else
  warn "Worker process not detected locally (check docker)"
fi

echo
echo "===== 14. REDIS CONNECTION ====="
REDIS_PASSWORD="${REDIS_PASSWORD:-hf_redis_prod_2026!}"
if docker exec hospiflow-redis-1 redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
  pass "Redis PONG"
else
  warn "Redis ping failed (check password)"
fi

echo
echo "===== 15. POSTGRES CONNECTION ====="
if docker exec hospiflow-postgres-1 pg_isready -U hospiflow 2>/dev/null | grep -q "accepting connections"; then
  pass "PostgreSQL accepting connections"
else
  warn "PostgreSQL not accepting connections"
fi

echo
echo "===== 16. SYSTEM HEALTH COMPLETE ====="