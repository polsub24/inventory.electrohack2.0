# Changes

A running log of changes made to this project in this session.

## Database migration: MongoDB → PostgreSQL

- Rewrote `server.js` from Mongoose/MongoDB to raw SQL via the `pg` driver. API routes, request/response JSON shapes, and status-transition logic (reserve → collect → reinstate) are unchanged, so the frontend needed no changes.
- New schema (auto-created on server startup, no manual migration step):
  - `components` — `id UUID`, `name`, `category`, `total_quantity`, `reserved_quantity`, `has_quantity_limit`
  - `teams` — `id UUID`, `team_name` (unique), `leader_name`, `registration_number` (unique), `password`
  - `requests` — `id UUID`, `team_id` (FK → teams), `status`, `timestamp`, `notes`
  - `request_items` — normalized join table (FK → requests, FK → components, `quantity`), replacing Mongo's embedded `items` array
  - IDs are Postgres `UUID`s via `gen_random_uuid()` (`pgcrypto` extension) instead of Mongo `ObjectId`s — still opaque strings to the frontend.
- `package.json`: removed `mongoose`, added `pg`.
- `.env` / `.env.example`: `MONGODB_URI` → `DATABASE_URL` (`postgresql://postgres:postgres@localhost:5432/electrohack`).
- Updated `README.md`, `SECURITY_CHECKLIST.md`, and the leftover `mongoose` entry in `index.html`'s import map to reflect Postgres.
- Local PostgreSQL 17.6 set up portably (no admin rights required) — binaries at `C:\Users\aryan\postgres`, data dir at `C:\Users\aryan\postgres-data`, `electrohack` database created.
- Verified end-to-end: team registration/login, request submission (stock reservation), approve → collect (stock deduction) → reinstate (stock restoration), rejection/deletion (reservation release), team deletion (cascading cleanup).

## Local dev environment setup

- Installed npm dependencies.
- MongoDB (before the Postgres migration) and PostgreSQL (after) were both installed **portably** — no admin rights available on this machine, so the official installers (which require elevation) were swapped for administrative MSI extraction (Mongo) and the EDB portable binaries zip (Postgres), each run standalone without a Windows service.
- `Instruction.MD` written and kept up to date with exact local run steps, including the no-admin-rights workarounds.

## Automated test suite

- Added `tests/api.test.js` using Node's built-in test runner (`node:test`, zero new dependencies) — spins up the real `server.js` against an isolated `electrohack_test` database on a separate port, so it never touches dev data.
- `npm test` (`node --test`) runs the suite: 26 tests covering health/seeding, team registration & login (incl. duplicate/invalid cases), component management, request submission & stock reservation (limited and unlimited components), the full request lifecycle (pending → approved → collected → reinstated), rejection/deletion stock restoration, team deletion cascades, admin login, and 404 edge cases.

## Security: admin password moved server-side

- Previously: `ADMIN_SECRET` was a hardcoded plaintext constant in `pages/AdminLoginPage.tsx`, compared client-side.
- Now: `POST /api/admin/login` (in `server.js`) checks the password against `process.env.ADMIN_SECRET` using a constant-time comparison (`crypto.timingSafeEqual`), and the frontend calls this endpoint instead of comparing locally.
- `ADMIN_SECRET` added to `.env` (server-side only) and `.env.example` (placeholder). This intentionally does **not** use a `VITE_`-prefixed variable, because Vite inlines those into the built client JS — a `VITE_ADMIN_SECRET` would be just as readable in devtools as the original hardcoded constant. Keeping it as a plain (non-`VITE_`) server env var is what actually keeps it off the client.
- Added test coverage for the new endpoint (correct/incorrect/missing password).

## Non-sensitive config: session storage key

- `SESSION_STORAGE_KEY` in `context/AuthContext.tsx` (the browser `sessionStorage` key used to persist the logged-in user) was hardcoded; moved to `import.meta.env.VITE_SESSION_STORAGE_KEY`, with the original value kept as a fallback default.
- Unlike `ADMIN_SECRET`, this value isn't sensitive — it's just a storage key name — so it's fine (and correct) for it to use a `VITE_`-prefixed variable.
- Added `VITE_SESSION_STORAGE_KEY=electrohack_user_session` to `.env` and `.env.example`, and typed it in `vite-env.d.ts` via an `ImportMetaEnv` declaration.

## Code review fixes (Postgres migration + admin login)

- `dbConnected` no longer gets stuck `false` forever after one transient `pool.on('error')` event — added `tryReconnect()`, which probes with `SELECT 1` and restores it once the pool recovers.
- Fixed the inverse startup race: `dbConnected` is now set only after `initSchema()`/`seedAndSync()` finish, not right after the raw connection succeeds, so early requests can't hit a missing-table error. A `schemaReady` latch also stops `tryReconnect()` from marking the DB ready off a bare connectivity check if a pool error fires mid-startup, before the tables exist.
- `teams` lookups by name/registration number (`ILIKE`) now run user input through `escapeLikePattern()` first, so literal `%`/`_` in a team name or reg number can no longer be (mis)treated as SQL wildcards.
- `secretsMatch` now SHA-256 hashes both sides before `crypto.timingSafeEqual`, removing a timing side-channel where a length-mismatched guess returned faster than a same-length wrong guess.
- Extracted a shared `adjustStock(client, items, column, sign)` helper and replaced six near-identical per-item stock-adjustment loops (spread across the request/reinstate/delete/team-delete routes) with batched `UPDATE ... FROM unnest(...)` calls — one round trip per call instead of one per item, with per-component deltas pre-aggregated to avoid Postgres' `UPDATE ... FROM` only applying one of several matching source rows.

## Notes on existing behavior confirmed during this session

- The frontend has no separate in-memory source of truth — `context/InventoryContext.tsx` polls `GET /api/inventory` every 2 seconds, so any change made directly in the database (e.g. via `psql`/pgAdmin) or through the UI shows up in every open browser tab within ~2 seconds. Verified live by inserting a component directly into Postgres and confirming it appeared via the API without any app-side code change.
- A "Manage Teams" admin UI already existed (`components/admin/TeamManager.tsx`) for viewing/searching participants, seeing each team's collected/returned inventory, registering teams manually, and deleting teams — no new code needed, just pointed out where it lives in the Admin Dashboard tabs.
