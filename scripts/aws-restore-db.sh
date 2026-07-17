#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/jemaw-cloudsql.dump" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_DIR="$ROOT_DIR/infra/aws"
INPUT_DUMP_PATH="$1"

if [[ ! -f "$INPUT_DUMP_PATH" ]]; then
  echo "Dump file not found: $INPUT_DUMP_PATH" >&2
  exit 1
fi

DUMP_DIR="$(cd "$(dirname "$INPUT_DUMP_PATH")" && pwd)"
DUMP_FILE="$(basename "$INPUT_DUMP_PATH")"
DUMP_PATH="$DUMP_DIR/$DUMP_FILE"

PG_RESTORE="${PG_RESTORE:-/opt/homebrew/opt/libpq/bin/pg_restore}"
PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"

if [[ ! -x "$PG_RESTORE" ]]; then
  PG_RESTORE="$(command -v pg_restore)"
fi
if [[ ! -x "$PSQL" ]]; then
  PSQL="$(command -v psql)"
fi

cd "$AWS_DIR"
TF_BIN="${TF_BIN:-$(command -v terraform || command -v tofu || true)}"
if [[ -z "$TF_BIN" ]]; then
  echo "terraform or tofu is required." >&2
  exit 1
fi

DB_URL="$(aws secretsmanager get-secret-value --secret-id "$("$TF_BIN" output -raw database_url_secret_arn)" --query SecretString --output text)"

"$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 -c "select version();"

restore_log="$(mktemp)"
if ! "$PG_RESTORE" --no-owner --no-acl --clean --if-exists --dbname "$DB_URL" "$DUMP_PATH" 2>"$restore_log"; then
  if grep -q "unsupported version" "$restore_log" && command -v docker >/dev/null 2>&1; then
    cat "$restore_log" >&2
    echo "Retrying restore with postgres:17-alpine pg_restore via Docker..." >&2
    docker run --rm \
      -v "$DUMP_DIR:/backups:ro" \
      postgres:17-alpine \
      pg_restore --no-owner --no-acl --clean --if-exists --dbname "$DB_URL" "/backups/$DUMP_FILE"
  else
    cat "$restore_log" >&2
    exit 1
  fi
fi
rm -f "$restore_log"

"$PSQL" "$DB_URL" -At -c "select schemaname || '.' || relname || '=' || n_live_tup from pg_stat_user_tables order by schemaname, relname;"
