# Deploying Jemaw on Google Cloud

Stack:
- **Bot/API** → Cloud Run (container, webhook mode, min-instances=1)
- **Postgres** → Cloud SQL in project `jemaw-498106` (via the Unix socket)
- **Mini App** → Firebase Hosting (static SPA)
- **Gemini** → key in project `gen-lang-client-0305882074` (used in Phase 3)

The bot image is already verified to build and run locally
(`packages/bot/Dockerfile`). You run the deploy steps below — they touch your
GCP billing and need interactive login.

---

## 0. One-time setup

```bash
# Point gcloud at the Jemaw project (NOT osteodata-staging).
# Project: "Jemaw" — id gen-lang-client-0305882074 (number 1074160264056).
gcloud config set project gen-lang-client-0305882074
gcloud auth login

# Enable the APIs we need.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Create the Artifact Registry repo the image is pushed to (one time).
gcloud artifacts repositories create jemaw \
  --repository-format=docker --location=europe-west1 \
  --description="Jemaw images"

# Firebase CLI for the Mini App.
npm install -g firebase-tools
firebase login
```

---

## 1. Database (Cloud SQL)

This deployment uses **Cloud SQL (Postgres)** in project `jemaw-498106`
(connection name `jemaw-498106:europe-west1:jemaw-pg`). Set it up and migrate
through the Auth Proxy as documented in `HANDLER.md`. In Cloud Run the bot
connects over the mounted Unix socket, not the proxy.

---

## 2. Secrets (Secret Manager)

Store the bot token and the socket-form DATABASE_URL as secrets. The socket URL
omits the host (`postgres://USER:PASSWORD@/DBNAME`); the host is supplied by the
`INSTANCE_CONNECTION_NAME` env var in the container.

```bash
gcloud services enable secretmanager.googleapis.com

printf '%s' "<fresh-bot-token>" | gcloud secrets create jemaw-bot-token --data-file=-
printf '%s' "postgres://jemaw:<db-password>@/jemaw" | gcloud secrets create jemaw-database-url --data-file=-

# Let the Cloud Run runtime service account read them.
SA="$(gcloud projects describe jemaw-498106 --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for S in jemaw-bot-token jemaw-database-url; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

---

## 3. Build + deploy the bot → Cloud Run

```bash
REGION=europe-west1
CONN=jemaw-498106:europe-west1:jemaw-pg

gcloud artifacts repositories create jemaw \
  --repository-format=docker --location=$REGION   # one time

# Build the image (cloudbuild.yaml points at packages/bot/Dockerfile).
gcloud builds submit --config cloudbuild.yaml .

# Deploy. WEBHOOK_URL is a placeholder on the first deploy because we don't know
# the service URL yet; the container starts anyway (it listens before calling
# setWebhook), so we can read the URL and update it.
gcloud run deploy jemaw-bot \
  --region $REGION \
  --image europe-west1-docker.pkg.dev/jemaw-498106/jemaw/jemaw-bot:latest \
  --allow-unauthenticated --min-instances 1 --max-instances 2 --port 8080 \
  --add-cloudsql-instances $CONN \
  --set-env-vars NODE_ENV=production,BOT_MODE=webhook,WEBHOOK_URL=https://placeholder.invalid,INSTANCE_CONNECTION_NAME=$CONN \
  --set-secrets DATABASE_URL=jemaw-database-url:latest,TELEGRAM_BOT_TOKEN=jemaw-bot-token:latest

URL=$(gcloud run services describe jemaw-bot --region $REGION --format='value(status.url)')
curl -s "$URL/health"      # → {"ok":true,"service":"jemaw-bot"}

# Now set the real WEBHOOK_URL (and the Mini App origin for CORS). The bot
# registers the webhook with Telegram on the next boot.
gcloud run services update jemaw-bot --region $REGION \
  --update-env-vars WEBHOOK_URL="$URL",MINI_APP_URL="https://<your-app>.web.app"

# Verify Telegram accepted it.
curl -s "https://api.telegram.org/bot<token>/getWebhookInfo"   # url should match $URL
```

---

## 4. Mini App → Firebase Hosting

```bash
# Build the SPA, pointing it at the Cloud Run API.
VITE_API_BASE_URL="$URL" pnpm --filter @jemaw/app build

# Initialize hosting once (choose the Jemaw project; public dir: packages/app/dist).
firebase use --add            # select project jemaw-498106
firebase deploy --only hosting
```

This serves the SPA at `https://<project>.web.app`. Use that as the Mini App
URL in @BotFather (`/newapp` or `/setmenubutton`) and as `MINI_APP_URL` (step 2b).

---

## 5. Wire the Mini App into Telegram

In @BotFather:
- `/setprivacy` → **Disable** (so the bot can read group messages — required for
  Phase 3 Gemini scans; harmless to do now).
- `/newapp` (or `/setmenubutton`) → set the Web App URL to your Firebase URL.

Then add @jemawsbot to your group and send `/start`. The bot captures the group
id automatically and posts the pinned button.

---

## 6. Redeploys

- **Bot:** re-run `gcloud builds submit --config cloudbuild.yaml .` then
  `gcloud run services update jemaw-bot --region $REGION --image ...:latest`.
- **Mini App:** `pnpm --filter @jemaw/app build && firebase deploy --only hosting`.
- **Rotate a secret:** `printf '%s' "<new>" | gcloud secrets versions add jemaw-bot-token --data-file=-`
  then redeploy (Cloud Run picks up `:latest`).

---

## Notes & costs

- Cloud Run with `min-instances=1` is not free (a small always-on cost, roughly
  a few dollars/month at idle). Set `--min-instances 0` to scale to zero and cut
  cost, but the bot may miss the first webhook after going cold (Telegram
  retries, so it usually recovers).
- Cloud SQL `db-f1-micro` is roughly $8 to $10/month, always on.
- Firebase Hosting free tier is ample for a static SPA.
- Deployment verified live: image builds via Cloud Build, the container connects
  to Cloud SQL over the Unix socket, `/health` returns ok, and the webhook is
  registered with Telegram.
