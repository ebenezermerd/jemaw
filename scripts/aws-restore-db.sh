#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/jemaw-cloudsql.dump" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_DIR="$ROOT_DIR/infra/aws"
DUMP_PATH="$1"

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Dump file not found: $DUMP_PATH" >&2
  exit 1
fi

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
"$PG_RESTORE" --no-owner --no-acl --clean --if-exists --dbname "$DB_URL" "$DUMP_PATH"
"$PSQL" "$DB_URL" -At -c "select schemaname || '.' || relname || '=' || n_live_tup from pg_stat_user_tables order by schemaname, relname;"
