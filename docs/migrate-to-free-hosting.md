# Free hosting for Jemaw

Both paid clouds are gone: AWS (ECS + RDS) was suspended for unpaid charges and the
GCP project `jemaw-498106` (Cloud Run, Firebase Hosting, Firebase Auth) is suspended
too. Jemaw now runs on free tiers only, with no card on file anywhere.

| Piece | Host | URL |
| --- | --- | --- |
| Database (Postgres) | **Neon** free, project `frosty-moon-46010184`, db `neondb`, us-east-1 | pooled connection string via `neonctl` |
| Bot + mini app API (Fastify + grammy) | **Render** free web service `jemaw-bot`, Virginia | https://jemaw-bot.onrender.com |
| Mini app (Vite SPA) | **Cloudflare Workers** static assets `jemaw-app` | https://jemaw-app.ebenezermerd.workers.dev |
| AI (Groq / Gemini) | outbound API calls from the bot | keys set as Render env vars |

Koyeb is not an option: its free tier closed to new users after the Mistral acquisition (Feb 2026).

## Database

The Oct 4 2026 RDS dump (`backups/jemaw-rds-2026-10-04-2008.dump`, git-ignored) was
restored into Neon. To restore again or into a fresh Neon project:

```bash
URL="$(neonctl connection-string --project-id frosty-moon-46010184)"
/opt/homebrew/opt/libpq/bin/pg_restore --no-owner --no-acl --clean --if-exists \
  --single-transaction -d "$URL" backups/jemaw-rds-2026-10-04-2008.dump
DATABASE_URL="$URL" pnpm db:migrate
```

## Bot on Render

One-time setup (`brew install render`, `render login`, `render workspace set`), then:

```bash
scripts/render-deploy-bot.sh
```

The script reads the bot token and AI keys from `.env` and the database URL from `neonctl`. Render
builds from GitHub `main` and redeploys on every push touching `packages/bot`,
`packages/shared` or the lockfile. On boot the bot registers its Telegram webhook at
`https://jemaw-bot.onrender.com` and runs one weekly digest sweep.

Change env vars later in the Render dashboard (Environment tab); it redeploys itself.

### Sleeping and the 750 free hours

Render sleeps a free service after 15 idle minutes, and the 750 free instance hours per
month are shared by every free service in the EPNICS workspace. The
`Keep bot awake` GitHub Action pings `/health` every 10 minutes from 06:00 to 24:00 EAT
(about 560 hours a month). Overnight the bot sleeps, and the first Telegram message
wakes it in roughly 30 to 60 seconds; Telegram retries the webhook until it answers.

## Mini app on Cloudflare

```bash
scripts/cloudflare-deploy-app.sh
```

The API URL is baked in at build time from `packages/app/.env.production`. Routing
fallback and cache headers live in `packages/app/wrangler.jsonc` and
`packages/app/public/_headers`.

In @BotFather, set the Mini App URL (`/myapps` → Jemaw → Edit Web App URL) to
https://jemaw-app.ebenezermerd.workers.dev.

## Verify

1. `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` shows `https://jemaw-bot.onrender.com/telegram/webhook` with no recent error.
2. `curl https://jemaw-bot.onrender.com/health` returns ok.
3. Open the mini app from Telegram and confirm it loads group data.
4. Run `/digest` in a group to check the AI path end to end.
