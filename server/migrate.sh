#!/usr/bin/env bash
# Unified migration runner with tracking table
# Usage: bash migrate.sh                  — run locally on VPS (as root, uses sudo -u postgres)
#        bash migrate.sh --remote         — run via SSH from local machine
# All migrations are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"
DB_NAME="smartplate_db"
PSQL="sudo -u postgres psql $DB_NAME"

if [ "${1:-}" = "--remote" ]; then
  echo "Running migrations remotely on VPS..."
  ssh root@5.42.119.198 "mkdir -p /var/www/smartplate-api/migrations"
  scp "$(dirname "$0")"/migrations/*.sql root@5.42.119.198:/var/www/smartplate-api/migrations/
  scp "$(dirname "$0")/migrate.sh" root@5.42.119.198:/var/www/smartplate-api/migrate.sh
  ssh root@5.42.119.198 "cd /var/www/smartplate-api && bash migrate.sh"
  exit $?
fi

echo "=== Migration Runner ==="

# Create tracking table (owned by postgres — same as all other tables)
$PSQL -q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON schema_migrations TO smartplate;
SQL

APPLIED=0
SKIPPED=0

for f in "$MIGRATIONS_DIR"/*.sql; do
  fname=$(basename "$f")
  already=$($PSQL -tAc "SELECT COUNT(*) FROM schema_migrations WHERE filename='$fname'")
  if [ "$already" -gt 0 ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  echo "  Applying: $fname"
  $PSQL -q -f "$f"
  $PSQL -q -c "INSERT INTO schema_migrations (filename) VALUES ('$fname')"
  APPLIED=$((APPLIED + 1))
done

echo "=== Done: $APPLIED applied, $SKIPPED skipped ==="
