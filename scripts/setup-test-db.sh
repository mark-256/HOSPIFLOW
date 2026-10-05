#!/usr/bin/env bash
# HOSPIFLOW B38 — Safe Test Database Setup
#
# Creates and migrates the isolated test database used by integration tests.
#
# Safety guarantees:
#   * Refuses to run if DATABASE_TEST_URL is not configured.
#   * Refuses to run if DATABASE_TEST_URL resolves to the development database.
#   * Never reads, writes, migrates or drops DATABASE_URL.
#   * Destructive commands are only ever issued against DATABASE_TEST_URL.
#
# Usage:
#   export DATABASE_TEST_URL="postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test"
#   scripts/setup-test-db.sh
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

die() {
  echo -e "${RED}ERROR:${NC} $1" >&2
  exit 1
}

# Parse a PostgreSQL URL into host, port, dbname, user, password
parse_url() {
  local url="$1"
  local stripped="${url#postgresql://}"
  local userinfo="${stripped%%@*}"
  local rest="${stripped#*@}"
  local hostport="${rest%%/*}"
  local dbname="${rest#*/}"
  dbname="${dbname%%\?*}"

  local host port user password
  if [[ "$hostport" == *:* ]]; then
    host="${hostport%%:*}"
    port="${hostport##*:}"
  else
    host="$hostport"
    port="5432"
  fi

  if [[ "$userinfo" == *:* ]]; then
    user="${userinfo%%:*}"
    password="${userinfo##*:}"
  else
    user="$userinfo"
    password=""
  fi

  echo "host=$host port=$port dbname=$dbname user=$user password=$password"
}

# --- Safety Guard 1: DATABASE_TEST_URL must be configured ---------------------
if [ -z "${DATABASE_TEST_URL:-}" ]; then
  echo -e "${RED}TEST DATABASE CONFIGURATION ERROR:${NC}"
  echo "DATABASE_TEST_URL is not configured."
  echo "Refusing to run destructive setup commands against DATABASE_URL."
  echo
  echo "Set DATABASE_TEST_URL to a dedicated test database:"
  echo "  export DATABASE_TEST_URL=\"postgresql://hospiflow:hospiflow_dev@localhost:5432/hospiflow_test\""
  exit 1
fi

TEST_DB_URL="$DATABASE_TEST_URL"

DEV_DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^/?]+).*|\1|')
TEST_DB_NAME=$(echo "$TEST_DB_URL" | sed -E 's|.*/([^/?]+).*|\1|')

[ -n "$TEST_DB_NAME" ] || die "Could not parse database name from DATABASE_TEST_URL"

# --- Safety Guard 2: never target the development database -------------------
if [ "$TEST_DB_NAME" = "$DEV_DB_NAME" ]; then
  echo -e "${RED}REFUSING TO RUN:${NC} DATABASE_TEST_URL points to the same database as DATABASE_URL."
  echo "  DATABASE_URL:      $DB_URL"
  echo "  DATABASE_TEST_URL: $TEST_DB_URL"
  echo
  echo "The test database must be physically separate from the development database."
  exit 1
fi

# --- Safety Guard 3: known development/production database name --------------
case "$TEST_DB_NAME" in
  hospiflow)
    echo -e "${RED}REFUSING TO RUN:${NC} DATABASE_TEST_URL resolves to the 'hospiflow' database."
    echo "That name is used by the development and production environments."
    exit 1
    ;;
esac

echo -e "${GREEN}Test database isolation verified${NC}"
echo "  DATABASE_URL:      $DB_URL (development — will NOT be touched)"
echo "  DATABASE_TEST_URL: $TEST_DB_URL (test)"
echo

# --- Parse the TEST connection only (DATABASE_URL is never parsed for commands)
eval "$(parse_url "$TEST_DB_URL")"

export PGPASSWORD="${password:-}"

# --- Create the test database if it does not exist ---------------------------
if psql -h "$host" -p "$port" -U "$user" -d postgres -tAc \
     "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB_NAME'" 2>/dev/null | grep -q 1; then
  echo -e "${YELLOW}Database '${TEST_DB_NAME}' already exists — skipping creation.${NC}"
else
  echo "Creating test database '${TEST_DB_NAME}'..."
  if ! createdb -h "$host" -p "$port" -U "$user" "$TEST_DB_NAME"; then
    echo
    echo -e "${YELLOW}Automatic creation failed.${NC} The role '${user}' most likely lacks CREATEDB."
    echo "Create the test database once as a PostgreSQL superuser, then re-run this script:"
    echo "  sudo -u postgres createdb -O ${user} ${TEST_DB_NAME}"
    echo "  # or, with Docker Compose:"
    echo "  docker compose exec postgres createdb -U ${user} ${TEST_DB_NAME}"
    exit 1
  fi
  echo -e "${GREEN}Created database '${TEST_DB_NAME}'.${NC}"
fi

# --- Verify connectivity ----------------------------------------------------
echo "Verifying test database connectivity..."
pg_isready -h "$host" -p "$port" -d "$TEST_DB_NAME" -U "$user" \
  || die "Cannot connect to test database '${TEST_DB_NAME}' at ${host}:${port}"
echo -e "${GREEN}Test database '${TEST_DB_NAME}' is reachable.${NC}"

# --- Apply Prisma migrations to the TEST database only ----------------------
echo "Applying Prisma migrations to the test database..."
cd "$(dirname "$0")/../packages/database"
DATABASE_URL="$TEST_DB_URL" npx prisma migrate deploy \
  || die "Prisma migrate deploy failed against the test database"

echo
echo -e "${GREEN}Test database setup complete.${NC}"
echo "To run the integration suite:"
echo "  export DATABASE_TEST_URL=\"$TEST_DB_URL\""
echo "  npm test"
