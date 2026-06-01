# Jemaw — Handler Reference

Operational commands for running Jemaw against **Cloud SQL (Postgres)** via the
**Cloud SQL Auth Proxy**, mirroring the osteodata ICD-migration workflow.

Database project: **`jemaw-498106`** (billing enabled) hosts the Cloud SQL
instance. The Gemini API key lives in a separate project
`gen-lang-client-0305882074`; the two are independent and that is fine.
Instance connection name: **`jemaw-498106:europe-west1:jemaw-pg`**

Secrets (passwords) live in the gitignored `.gcp-secrets.env` at the repo root.
`source` it before running the commands below: `set -a; . ./.gcp-secrets.env; set +a`

---

## Table of Contents
1. [GCP Auth & Project](#1-gcp-auth--project)
2. [Cloud SQL Instance Setup](#2-cloud-sql-instance-setup)
3. [Cloud SQL Auth Proxy](#3-cloud-sql-auth-proxy)
4. [Drizzle Migrations through the Proxy](#4-drizzle-migrations-through-the-proxy)
5. [Database Exploration](#5-database-exploration)
6. [Running the Bot against Cloud SQL](#6-running-the-bot-against-cloud-sql)
7. [Quick Reference](#7-quick-reference)

---

## 1. GCP Auth & Project

```bash
gcloud auth list
gcloud config set project gen-lang-client-0305882074
gcloud projects list --filter="projectNumber=1074160264056"
gcloud services enable sqladmin.googleapis.com
```

---

## 2. Cloud SQL Instance Setup

> Billable. Smallest tier (`db-f1-micro`, ~$8-10/mo). Run once.

```bash
set -a; . ./.gcp-secrets.env; set +a

# Instance (Postgres 16, shared-core, 10GB HDD, no backups to minimize cost).
gcloud sql instances create "$CLOUDSQL_INSTANCE" \
  --project=jemaw-498106 \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$CLOUDSQL_REGION" \
  --storage-size=10GB --storage-type=HDD \
  --root-password="$CLOUDSQL_ROOT_PASSWORD" \
  --no-backup

# Application database + user.
gcloud sql databases create "$JEMAW_DB_NAME" --instance="$CLOUDSQL_INSTANCE"
gcloud sql users create "$JEMAW_DB_USER" \
  --instance="$CLOUDSQL_INSTANCE" --password="$JEMAW_DB_PASSWORD"

# Confirm it's RUNNABLE.
gcloud sql instances describe "$CLOUDSQL_INSTANCE" --format="value(state)"
```

---

## 3. Cloud SQL Auth Proxy

The proxy authenticates with your gcloud creds and exposes the remote Postgres
on `127.0.0.1`. (Same tool/pattern as `cloud-sql-proxy ...:osteodata-mysql`.)

```bash
# Start (background). Postgres default port is 5432; we use 5433 locally to
# avoid clashing with the docker-compose Postgres on 5432.
cloud-sql-proxy jemaw-498106:europe-west1:jemaw-pg \
  --port 5433 &

# Verify it's listening.
lsof -i :5433
```

The DATABASE_URL through the proxy (password URL-encoded if it has special
chars — our generated password is alphanumeric, so no encoding needed):

```
postgres://jemaw:<JEMAW_DB_PASSWORD>@127.0.0.1:5433/jemaw
```

---

## 4. Drizzle Migrations through the Proxy

```bash
set -a; . ./.gcp-secrets.env; set +a
export DATABASE_URL="postgres://$JEMAW_DB_USER:$JEMAW_DB_PASSWORD@127.0.0.1:5433/$JEMAW_DB_NAME"

# Apply the committed migration(s).
pnpm db:migrate

# (Generate a new migration after schema edits.)
pnpm db:generate
```

> Drizzle config auto-loads the repo-root `.env`. For Cloud SQL, override
> DATABASE_URL inline as above (proxy URL) so it targets the cloud DB, not the
> local docker Postgres.

---

## 5. Database Exploration

`psql` via Docker (no local psql needed), through the proxy on host networking:

```bash
set -a; . ./.gcp-secrets.env; set +a

docker run --rm -i --network=host postgres:16-alpine \
  psql "postgres://$JEMAW_DB_USER:$JEMAW_DB_PASSWORD@127.0.0.1:5433/$JEMAW_DB_NAME" \
  -c "\dt"

# Row counts per table.
docker run --rm -i --network=host postgres:16-alpine \
  psql "postgres://$JEMAW_DB_USER:$JEMAW_DB_PASSWORD@127.0.0.1:5433/$JEMAW_DB_NAME" \
  -c "SELECT 'groups' t, count(*) FROM groups UNION ALL SELECT 'members', count(*) FROM members UNION ALL SELECT 'expenses', count(*) FROM expenses;"
```

---

## 6. Running the Bot against Cloud SQL

Point the bot's DATABASE_URL at the proxy. Edit `.env`:

```
DATABASE_URL=postgres://jemaw:<JEMAW_DB_PASSWORD>@127.0.0.1:5433/jemaw
```

Then (proxy must be running):

```bash
pnpm dev:bot     # Fastify + grammY (polling locally), now on Cloud SQL
pnpm dev:app     # Mini App on :5173
```

For **Cloud Run** later, the bot connects to Cloud SQL via the built-in
connector (no proxy in-container): add `--add-cloudsql-instances` and use the
Unix-socket host `/cloudsql/<connection-name>` in DATABASE_URL. See DEPLOY_GCP.md.

---

## 7. Quick Reference

```bash
# Proxy
cloud-sql-proxy jemaw-498106:europe-west1:jemaw-pg --port 5433 &
lsof -i :5433

# Migrate (through proxy)
set -a; . ./.gcp-secrets.env; set +a
DATABASE_URL="postgres://$JEMAW_DB_USER:$JEMAW_DB_PASSWORD@127.0.0.1:5433/$JEMAW_DB_NAME" pnpm db:migrate

# Inspect
docker run --rm -i --network=host postgres:16-alpine \
  psql "postgres://$JEMAW_DB_USER:$JEMAW_DB_PASSWORD@127.0.0.1:5433/$JEMAW_DB_NAME" -c "\dt"

# Stop the proxy
kill %1   # or: pkill -f cloud-sql-proxy
```
