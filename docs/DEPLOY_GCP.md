# Deploying Jemaw on Google Cloud

Stack:
- **Bot/API** → Cloud Run (container, webhook mode, min-instances=1)
- **Postgres** → Neon (kept; serverless, free tier)
- **Mini App** → Firebase Hosting (static SPA)
- **Gemini** → already in your project `1074160264056` (used in Phase 3)

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

## 1. Database (Neon)

Create a Neon Postgres (free tier) and copy its connection string, then apply
the schema from your machine:

```bash
DATABASE_URL="postgres://...neon.tech/jemaw?sslmode=require" pnpm db:migrate
```

---

## 2. Bot → Cloud Run (first deploy)

Cloud Build builds the image from the repo root; Cloud Run runs it.

```bash
REGION=europe-west1            # pick one near you
SERVICE=jemaw-bot

# Build the image with Cloud Build (uses packages/bot/Dockerfile).
gcloud builds submit --tag $REGION-docker.pkg.dev/$(gcloud config get-value project)/jemaw/$SERVICE \
  --gcs-source-staging-dir gs://$(gcloud config get-value project)_cloudbuild/source \
  --substitutions _DOCKERFILE=packages/bot/Dockerfile .
# (If the --tag form complains about the Dockerfile path, use the cloudbuild.yaml in step 2b.)

# First deploy WITHOUT WEBHOOK_URL (we don't know the URL yet). min-instances=1
# keeps the webhook bot warm so it never misses a Telegram update.
gcloud run deploy $SERVICE \
  --region $REGION \
  --image $REGION-docker.pkg.dev/$(gcloud config get-value project)/jemaw/$SERVICE \
  --allow-unauthenticated \
  --min-instances 1 \
  --port 8080 \
  --set-env-vars BOT_MODE=webhook,NODE_ENV=production \
  --set-env-vars DATABASE_URL="postgres://...neon.tech/jemaw?sslmode=require" \
  --set-env-vars TELEGRAM_BOT_TOKEN="<fresh-bot-token>"
```

Grab the service URL:

```bash
URL=$(gcloud run services describe $SERVICE --region $REGION --format='value(status.url)')
echo "$URL"
curl -s "$URL/health"      # → {"ok":true,"service":"jemaw-bot"}
```

### 2b. Set WEBHOOK_URL + MINI_APP_URL (second deploy)

Now that we have the URL, redeploy with it so grammY registers the webhook on
boot, plus the Mini App origin for CORS + buttons:

```bash
gcloud run services update $SERVICE --region $REGION \
  --update-env-vars WEBHOOK_URL="$URL",MINI_APP_URL="https://<your-app>.web.app"
```

On boot the bot calls `setWebhook` itself. Verify:

```bash
curl -s "https://api.telegram.org/bot<token>/getWebhookInfo"   # url should match $URL
```

> **Secrets:** for production, prefer Secret Manager over plain env vars:
> `gcloud secrets create jemaw-bot-token --data-file=-` then
> `--set-secrets TELEGRAM_BOT_TOKEN=jemaw-bot-token:latest` on deploy.

---

## 3. Mini App → Firebase Hosting

```bash
# Build the SPA, pointing it at the Cloud Run API.
VITE_API_BASE_URL="$URL" pnpm --filter @jemaw/app build

# Initialize hosting once (choose the Jemaw project; public dir: packages/app/dist).
firebase use --add            # select project 1074160264056
firebase deploy --only hosting
```

This serves the SPA at `https://<project>.web.app`. Use that as the Mini App
URL in @BotFather (`/newapp` or `/setmenubutton`) and as `MINI_APP_URL` (step 2b).

---

## 4. Wire the Mini App into Telegram

In @BotFather:
- `/setprivacy` → **Disable** (so the bot can read group messages — required for
  Phase 3 Gemini scans; harmless to do now).
- `/newapp` (or `/setmenubutton`) → set the Web App URL to your Firebase URL.

Then add @jemawsbot to your group and send `/start`. The bot captures the group
id automatically and posts the pinned button.

---

## 5. Redeploys

- **Bot:** re-run `gcloud builds submit ...` then `gcloud run deploy ...` (or
  `gcloud run services update --image ...`).
- **Mini App:** `pnpm --filter @jemaw/app build && firebase deploy --only hosting`.

---

## Notes & costs

- Cloud Run with `min-instances=1` is not free (a small always-on cost, roughly
  a few dollars/month at idle). Set `--min-instances 0` to scale to zero and cut
  cost, but the bot may miss the first webhook after going cold (Telegram
  retries, so it usually recovers).
- Neon free tier covers a single active group comfortably.
- Firebase Hosting free tier is ample for a static SPA.
- The image was verified locally: builds, connects to Postgres, polls as
  @jemawsbot, serves /health.
