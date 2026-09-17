# Deployment Guide

One Node process serves both the API and the built frontend (`server.js` statically serves
`dist/` when `NODE_ENV=production` — see line ~1522). No separate frontend host needed.

Target: **Render**, single Web Service (frontend + backend together, no split needed).

## 1. Provision Postgres

Render dashboard → New → PostgreSQL. Free/Starter plan is enough for a hackathon. Copy its
**Internal Database URL** (same-region services talk to it privately, no egress cost) — that's
your `DATABASE_URL`.

## 2. Create the Render Web Service

New → Web Service → connect this GitHub repo. Settings:

| Setting | Value |
|---|---|
| Branch | `aryan` — deploying straight from this branch, not `main` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health Check Path | `/api/health` |
| Auto-Deploy | **After CI Checks Pass** — Render waits for the GitHub Actions check on the commit before deploying |

Set environment variables (Render dashboard → Environment):

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@host:port/db` |
| `ADMIN_SECRET` | yes | Admin login passkey. Use a real random secret, not the example value. |
| `TEAM_PASSWORD_ENC_SECRET` | recommended | Separate key for encrypting team passwords at rest. If unset, derives from `ADMIN_SECRET` — fine, but then you can never rotate `ADMIN_SECRET` without breaking stored team passwords. |
| `PORT` | no | Defaults to 3000. Most platforms inject their own — leave unset and let them. |
| `NODE_ENV` | yes | Must be `production` — this is what turns on serving `dist/`. |
| `GEMINI_API_KEY` | no | Only if AI features are used. |
| `VITE_SESSION_STORAGE_KEY` | no | Cosmetic, has a working default. |

`server.js` calls `initSchema()` on boot — tables/columns/indexes are created idempotently, so
first boot on an empty DB just works. No separate migration step. Render terminates TLS for you;
the app just listens on the `PORT` Render injects.

## 3. CI/CD

`.github/workflows/deploy.yml` runs on every push and PR: installs, type-checks, builds, and runs
`npm test` against a throwaway Postgres service container. It reports back as a GitHub check on
the commit — that's the only wiring needed, since Render's **Auto-Deploy: After CI Checks Pass**
(step 2) watches that check itself and only deploys once it's green. No Deploy Hook, no GitHub
secret, no separate deploy job.

## 4. Post-deploy checklist

- [ ] Hit `GET /api/health` — confirms `{"database":{"connected":true}}`.
- [ ] Log in to `/admin` with the real `ADMIN_SECRET` you set (not the example value).
- [ ] Register one throwaway team, confirm login works, then delete it via the admin UI.
- [ ] Confirm `.env` is not committed (`git check-ignore -v .env`).

## Time estimate

- Render Postgres + Web Service + CI/CD wiring: **~20–30 min**, mostly waiting on the first build.
