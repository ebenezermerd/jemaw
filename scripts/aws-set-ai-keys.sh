#!/usr/bin/env bash
# Store / rotate AI API keys in AWS Secrets Manager and restart the bot.
# Keys are never written to the repo — only to Secrets Manager.
#
# Usage:
#   export GEMINI_API_KEY='...'   # optional if already set in SM and you only rotate Groq
#   export GROQ_API_KEY='...'     # optional same
#   export GROQ_MODEL='llama-3.3-70b-versatile'  # optional
#   export GEMINI_MODEL='gemini-2.5-flash'  # optional
#   ./scripts/aws-set-ai-keys.sh
#
# Or interactive (prompt, no echo):
#   ./scripts/aws-set-ai-keys.sh --prompt
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-north-1}}"
export AWS_DEFAULT_REGION="$REGION"
export AWS_REGION="$REGION"

PREFIX="${JEMAW_SECRET_PREFIX:-jemaw-prod}"
CLUSTER="${JEMAW_ECS_CLUSTER:-jemaw-prod-bot}"
SERVICE="${JEMAW_ECS_SERVICE:-jemaw-prod-bot}"
EXEC_ROLE="${JEMAW_ECS_EXEC_ROLE:-jemaw-prod-ecs-task-execution}"
POLICY_NAME="${JEMAW_ECS_SECRETS_POLICY:-jemaw-prod-secrets}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}
need_cmd aws
need_cmd python3

aws sts get-caller-identity >/dev/null

if [[ "${1:-}" == "--prompt" ]]; then
  read -r -s -p "GEMINI_API_KEY (leave blank to skip): " GEMINI_API_KEY
  echo
  read -r -s -p "GROQ_API_KEY (leave blank to skip): " GROQ_API_KEY
  echo
  read -r -p "GROQ_MODEL [${GROQ_MODEL:-llama-3.3-70b-versatile}]: " _model
  GROQ_MODEL="${_model:-${GROQ_MODEL:-llama-3.3-70b-versatile}}"
  read -r -p "GEMINI_MODEL [${GEMINI_MODEL:-gemini-2.5-flash}]: " _gmodel
  GEMINI_MODEL="${_gmodel:-${GEMINI_MODEL:-gemini-2.5-flash}}"
fi

GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GROQ_API_KEY="${GROQ_API_KEY:-}"
GROQ_MODEL="${GROQ_MODEL:-llama-3.3-70b-versatile}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

if [[ -z "$GEMINI_API_KEY" && -z "$GROQ_API_KEY" ]]; then
  echo "Provide GEMINI_API_KEY and/or GROQ_API_KEY via env, or use --prompt." >&2
  exit 1
fi

create_or_put() {
  local name="$1"
  local value="$2"
  local desc="$3"
  if aws secretsmanager describe-secret --secret-id "$name" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "$name" --secret-string "$value" >/dev/null
    echo "Updated secret: $name"
  else
    aws secretsmanager create-secret \
      --name "$name" \
      --description "$desc" \
      --secret-string "$value" \
      --tags Key=Project,Value=jemaw Key=Environment,Value=prod \
      >/dev/null
    echo "Created secret: $name"
  fi
}

if [[ -n "$GEMINI_API_KEY" ]]; then
  create_or_put "$PREFIX/gemini-api-key" "$GEMINI_API_KEY" "Jemaw Gemini API key for AI scans"
fi
if [[ -n "$GROQ_API_KEY" ]]; then
  create_or_put "$PREFIX/groq-api-key" "$GROQ_API_KEY" "Jemaw Groq API key for AI scans"
fi

# Resolve ARNs for required secrets
arn_for() {
  aws secretsmanager describe-secret --secret-id "$1" --query ARN --output text
}

DB_ARN="$(arn_for "$PREFIX/database-url")"
TG_ARN="$(arn_for "$PREFIX/telegram-bot-token")"
GEMINI_ARN=""
GROQ_ARN=""
if aws secretsmanager describe-secret --secret-id "$PREFIX/gemini-api-key" >/dev/null 2>&1; then
  GEMINI_ARN="$(arn_for "$PREFIX/gemini-api-key")"
fi
if aws secretsmanager describe-secret --secret-id "$PREFIX/groq-api-key" >/dev/null 2>&1; then
  GROQ_ARN="$(arn_for "$PREFIX/groq-api-key")"
fi

# IAM: allow task execution role to read all app secrets
RESOURCES=("$DB_ARN" "$TG_ARN")
[[ -n "$GEMINI_ARN" ]] && RESOURCES+=("$GEMINI_ARN")
[[ -n "$GROQ_ARN" ]] && RESOURCES+=("$GROQ_ARN")

python3 - "$POLICY_NAME" "$EXEC_ROLE" "${RESOURCES[@]}" <<'PY'
import json, subprocess, sys
policy_name, role, *resources = sys.argv[1:]
doc = {
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Action": ["secretsmanager:GetSecretValue"],
        "Resource": resources,
    }],
}
subprocess.check_call([
    "aws", "iam", "put-role-policy",
    "--role-name", role,
    "--policy-name", policy_name,
    "--policy-document", json.dumps(doc),
])
print(f"IAM policy {policy_name} updated ({len(resources)} secrets)")
PY

# Fetch current task definition and register a revision with AI secrets wired
TASK_DEF_ARN="$(
  aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
    --query 'services[0].taskDefinition' --output text
)"
aws ecs describe-task-definition --task-definition "$TASK_DEF_ARN" \
  --query 'taskDefinition' --output json >/tmp/jemaw-taskdef-current.json

python3 - <<PY
import json
from pathlib import Path

gemini_arn = """$GEMINI_ARN"""
groq_arn = """$GROQ_ARN"""
db_arn = """$DB_ARN"""
tg_arn = """$TG_ARN"""
groq_model = """$GROQ_MODEL"""
gemini_model = """$GEMINI_MODEL"""

td = json.loads(Path("/tmp/jemaw-taskdef-current.json").read_text())
keep = [
    "family", "taskRoleArn", "executionRoleArn", "networkMode",
    "containerDefinitions", "volumes", "placementConstraints",
    "requiresCompatibilities", "cpu", "memory", "runtimePlatform",
    "proxyConfiguration", "ipcMode", "pidMode", "ephemeralStorage",
]
new_td = {k: td[k] for k in keep if k in td and td[k] is not None}
c = new_td["containerDefinitions"][0]

env = {e["name"]: e["value"] for e in c.get("environment", [])}
if groq_model:
    env["GROQ_MODEL"] = groq_model
if gemini_model:
    env["GEMINI_MODEL"] = gemini_model
c["environment"] = [{"name": k, "value": v} for k, v in sorted(env.items())]

secrets = {s["name"]: s["valueFrom"] for s in c.get("secrets", [])}
secrets["DATABASE_URL"] = db_arn
secrets["TELEGRAM_BOT_TOKEN"] = tg_arn
if gemini_arn:
    secrets["GEMINI_API_KEY"] = gemini_arn
else:
    secrets.pop("GEMINI_API_KEY", None)
if groq_arn:
    secrets["GROQ_API_KEY"] = groq_arn
else:
    secrets.pop("GROQ_API_KEY", None)
c["secrets"] = [{"name": k, "valueFrom": v} for k, v in secrets.items()]

Path("/tmp/jemaw-taskdef-new.json").write_text(json.dumps(new_td))
print("secret env vars:", sorted(secrets.keys()))
PY

NEW_ARN="$(
  aws ecs register-task-definition \
    --cli-input-json file:///tmp/jemaw-taskdef-new.json \
    --query 'taskDefinition.taskDefinitionArn' --output text
)"
echo "Registered task definition: $NEW_ARN"

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --task-definition "$NEW_ARN" \
  --force-new-deployment \
  --query 'service.taskDefinition' --output text >/dev/null

echo "Forced new deployment on $CLUSTER/$SERVICE"
echo "Watch logs for: [scan] using Groq  (or Gemini)"
echo "  aws logs tail /ecs/${PREFIX}-bot --follow --region $REGION"

# Scrub keys from this process
unset GEMINI_API_KEY GROQ_API_KEY
rm -f /tmp/jemaw-taskdef-current.json /tmp/jemaw-taskdef-new.json
echo "Done. Keys are only in AWS Secrets Manager."
