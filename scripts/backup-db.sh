#!/bin/bash
# EthosFi — Manual database backup via Supabase CLI
# Run periodically or before any risky operation.
# Requires: npx supabase (installed via npm)
#
# Usage:
#   ./scripts/backup-db.sh
#   ./scripts/backup-db.sh production   (backs up production)
#   ./scripts/backup-db.sh test         (backs up test project)

set -e

ENV="${1:-production}"
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ "$ENV" = "test" ]; then
  DB_URL="postgresql://postgres:${TEST_DB_PASSWORD}@db.ehmingbvknavehcjgkou.supabase.co:5432/postgres"
  FILENAME="${BACKUP_DIR}/ethosfi_test_${TIMESTAMP}.sql"
else
  DB_URL="postgresql://postgres:${PROD_DB_PASSWORD}@db.${PROD_SUPABASE_REF}.supabase.co:5432/postgres"
  FILENAME="${BACKUP_DIR}/ethosfi_prod_${TIMESTAMP}.sql"
fi

echo "Backing up ${ENV} database to ${FILENAME}..."
pg_dump "$DB_URL" --no-owner --no-privileges > "$FILENAME"
echo "Backup complete: ${FILENAME} ($(wc -c < "$FILENAME") bytes)"
