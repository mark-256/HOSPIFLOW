#!/usr/bin/env bash
# HOSPIFLOW B38 — Redis Health Check
#
# Verifies Redis is reachable and responds to PING (PONG).
# Non-destructive: read-only PING, no configuration changes.
#
# Usage:
#   export REDIS_URL="redis://localhost:6379"   # host development
#   export REDIS_URL="redis://redis:6379"       # inside Docker Compose
#   scripts/redis-health-check.sh
set -euo pipefail

REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ping_via_cli() {
  # $1 = a command prefix, used for both host redis-cli and docker exec
  if [ -n "$REDIS_PASSWORD" ]; then
    redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null
  else
    redis-cli ping 2>/dev/null
  fi
}

OUTPUT=""

# 1. redis-cli on the host
if command -v redis-cli >/dev/null 2>&1; then
  if OUTPUT=$(ping_via_cli); then
    :
  else
    OUTPUT=""
  fi
fi

# 2. Fall back to any running redis container
if [ -z "$OUTPUT" ] && command -v docker >/dev/null 2>&1; then
  CONTAINER_ID=$(docker ps --filter "ancestor=redis:7-alpine" --format '{{.ID}}' 2>/dev/null | head -1)
  if [ -n "$CONTAINER_ID" ]; then
    if [ -n "$REDIS_PASSWORD" ]; then
      OUTPUT=$(docker exec "$CONTAINER_ID" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping 2>/dev/null || true)
    else
      OUTPUT=$(docker exec "$CONTAINER_ID" redis-cli ping 2>/dev/null || true)
    fi
    if [ -n "$OUTPUT" ]; then
      echo "Probed Redis inside container ${CONTAINER_ID}."
    fi
  fi
fi

echo "REDIS_URL: $REDIS_URL"

if [ -z "$OUTPUT" ]; then
  echo -e "${RED}FAIL:${NC} Could not reach Redis at $REDIS_URL"
  echo "  Start it with: docker compose up -d redis"
  echo "  Then set REDIS_URL to match how the app connects"
  echo "  (host: redis://localhost:6379, in Docker: redis://redis:6379)."
  exit 1
fi

if echo "$OUTPUT" | grep -q PONG; then
  echo -e "${GREEN}PASS:${NC} Redis PING -> PONG"
  exit 0
fi

echo -e "${RED}FAIL:${NC} Redis responded '${OUTPUT}' (expected PONG)"
exit 1
