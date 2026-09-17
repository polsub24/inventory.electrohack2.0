# ELECTROHACK 2.0 — Inventory Management System: Website Summary

## 1. What this website is

A real-time hardware inventory & request-tracking web app for a hackathon ("ELECTROHACK 2.0" by IEEE CAS). It lets **participant teams** browse available electronic components (Arduinos, sensors, ICs, modules, etc.), request them in a cart-style flow, and track approval/collection status. It lets **admins** manage the component catalog, review/approve/modify/reject requests, release ("collect") components, reinstate returned stock, and manage teams — all with near real-time sync across every connected client.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, React Router (`HashRouter`), Tailwind CSS, Context API |
| Backend | Node.js + Express.js (`server.js`), single-file REST API |
| Database | PostgreSQL via `pg` driver, tables auto-created on boot |
| Build tooling | Vite, TypeScript, Nodemon (dev) |
| Auth | Custom — team login (name+password) and a single shared admin passkey (`ADMIN_SECRET`), no JWT/session cookies — client just stores a `User` object in `sessionStorage` |

## 3. High-level architecture

```
React SPA (App.tsx)
 ├─ AuthProvider        (context/AuthContext.tsx)   → who is logged in (Participant | Admin)
 ├─ InventoryProvider   (context/InventoryContext.tsx) → components/teams/requests + all mutations
 ├─ AnimationProvider   (context/AnimationContext.tsx) → decorative "spark" burst effects
 └─ HashRouter → route guards based on `user.role`
        │
        ▼ fetch() calls
server/api.ts  (typed fetch wrapper, same-origin '' base URL)
        │
        ▼ HTTP
server.js  (Express REST API)
        │
        ▼ pg Pool
PostgreSQL: components / teams / requests / request_items
```

The frontend never talks to Postgres directly — `server/api.ts` is the only bridge, and `InventoryContext` is the single source of truth for all shared app state, polling the backend every **2 seconds** (`refreshData`) to simulate real-time sync (no websockets).

## 4. Data model (`types.ts` / Postgres schema)

- **Team**: `id, teamName, leaderName, registrationNumber, password?` (password only echoed back once at registration)
- **Component**: `id, name, category (Sensors|ICs|Passives|Modules), totalQuantity, reservedQuantity, hasQuantityLimit` — components can be **unlimited** (`hasQuantityLimit: false`), in which case quantity tracking is skipped entirely.
- **Request**: `id, teamId, team, status, items[], timestamp, notes?`
- **RequestItem**: `componentId, quantity, component`
- **RequestStatus** state machine:
  `PENDING_APPROVAL → MODIFIED_BY_ADMIN → APPROVED_READY → COLLECTED → RETURNED_TO_INVENTORY`, with `REJECTED` as a terminal branch from pending/modified.

Stock accounting has two buckets tracked server-side:
- **RESERVED** (`reserved_quantity`) — held while a request is `PENDING_APPROVAL`, `MODIFIED_BY_ADMIN`, or `APPROVED_READY`.
- **FINALIZED** (`total_quantity` deduction) — applied once a request hits `COLLECTED`.

`server.js` centralizes this in an `adjustStock()` helper and a `getStockImpactType()` switch so every transition (approve, reject, modify, collect, reinstate, delete) reverts the old impact and applies the new one atomically inside a DB transaction (`BEGIN`/`COMMIT` with row locks via `FOR UPDATE`).

## 5. Pages & routing (`App.tsx`)

| Route | Page | Guard |
|---|---|---|
| `/participant-login` | `ParticipantLoginPage` | only if logged out |
| `/admin-login` | `AdminLoginPage` | only if logged out |
| `/dashboard` | `ParticipantDashboardPage` | role === Participant |
| `/admin` | `AdminDashboardPage` | role === Admin |
| `/admin/request/:id` | `AdminRequestDetailPage` | role === Admin |
| `*` | redirects based on current auth state | — |

**Update:** Participant self-registration has been removed entirely — `pages/ParticipantRegisterPage.tsx` and the unused duplicate `components/admin/TeamRegistration.tsx` were deleted, `registerParticipant` was removed from `AuthContext`, and `POST /api/teams/register` is now gated by the same `requireAdmin` middleware as the other admin mutations. Team registration happens exclusively through the admin's "Manage Teams → Add New Team" flow (`TeamManager.tsx`).

## 6. Participant flow

1. **Login** (`ParticipantLoginPage`) with team name + password (issued by admin at registration).
2. **Dashboard** (`ParticipantDashboardPage`) — three tabs:
   - **Resources** (`ComponentList` → `ComponentCard`): browse components, see live availability (`total - reserved`), status badges (In Stock / Low Stock <5 / Depleted / Unlimited), add to a local cart with +/- steppers capped at available quantity.
   - **My Requests** (`RequestHistory`): tabbed view (Active / History / Collected / Cancelled) of the team's own requests with timestamps, item lists, quantities, and any admin notes.
   - **My Inventory** (`CollectedComponents`): components currently collected vs. returned to inventory, with totals.
3. **Cart** (`Cart.tsx`, slide-over panel): review items, adjust quantities, submit as one `Request` (`POST /api/requests`) — triggers a spark animation and shows a "Request Transmitted" confirmation before clearing.

## 7. Admin flow

1. **Login** (`AdminLoginPage`) — single shared passkey checked server-side via constant-time hash comparison (`secretsMatch`); no username, no per-admin accounts.
2. **Dashboard** (`AdminDashboardPage`) with a live "Live Sync" clock and 5 tabs:
   - **Queue** — `RequestList` filtered to `Pending`/`Modified`, new incoming rows highlighted + spark animation.
   - **Approved** — requests `Approved`/awaiting physical collection.
   - **History** — `Collected`/`Returned` requests.
   - **Manage Resources** — `InventoryManager`: add/edit components (name, category, total quantity, "Unlimited Stock" toggle), and a "Collections" modal listing which teams collected/returned a given component.
   - **Manage Teams** — `TeamManager`: search teams, register new teams (shows a one-time credentials panel with copy-to-clipboard for name/password), delete a team (cascades: restores stock, deletes their requests), and view a per-team collected/returned inventory modal.
   - **DashboardMetrics** (shown above the tabs): Total Units, Reserved, Queue count, Ready count, Low Stock alert count (<10 available).
3. **Request detail** (`/admin/request/:id` → `RequestDetailView`): per-item table showing requested vs. adjusted quantity (with +/- editing), ability to add new components to the request, an internal notes textarea, and status-dependent actions:
   - `Apply Changes` (modify quantities/notes without changing status → `MODIFIED_BY_ADMIN`)
   - `Confirm & Approve` → `APPROVED_READY`
   - `Deny Request` → `REJECTED`
   - `Finalize Release (Collected)` (only when Approved) → `COLLECTED`, deducts from total stock
   - `Reinstate Inventory` (only when Collected) → `RETURNED_TO_INVENTORY`, restores total stock
   - `Delete History` — deletes the request record entirely and restores whatever stock impact it had

## 8. Backend API (`server.js`)

| Method & Path | Purpose |
|---|---|
| `GET /api/health` | DB connectivity/schema-ready check |
| `GET /api/inventory` | Full state dump: components, teams, requests (joined with items+components) |
| `POST /api/teams/register` | Create team, auto-generate an 8-char alphanumeric password, enforce unique team name / reg number |
| `POST /api/teams/login` | Team auth by name + plaintext password |
| `POST /api/admin/login` | Passkey check against `ADMIN_SECRET` |
| `DELETE /api/teams/:id` | Delete team, cascades to requests, restores stock |
| `POST /api/requests` | Submit a cart as a new `PENDING_APPROVAL` request, reserves stock |
| `PATCH /api/requests/:id` | Update status and/or items/notes; transactionally reverts old stock impact and applies new one |
| `PATCH /api/requests/:id/reinstate` | Collected → Returned, restores total stock (only valid from `COLLECTED`) |
| `DELETE /api/requests/:id` | Delete a request record, restoring whatever stock it held |
| `PUT /api/components` | Create or update a component (upsert by UUID) |

Startup sequence: connect to Postgres with retry/backoff → `initSchema()` (creates 4 tables + `pgcrypto` extension if missing) → `seedAndSync()` (seeds 4 demo components if the table is empty, then `recalculateInventory()` to resync `reserved_quantity` from actual active requests — guards against drift, e.g. from a crash mid-transaction).

## 9. Notable technical/security details

- **Constant-time admin password check** using SHA-256 hash + `crypto.timingSafeEqual` to avoid timing attacks.
- **LIKE-pattern escaping** (`escapeLikePattern`) before `ILIKE` queries on team name/reg number to prevent wildcard injection.
- **UUID validation** (`isValidUUID`) before treating a component `id` as an update vs. insert.
- **Batched stock adjustments**: `adjustStock()` aggregates per-component deltas and applies them in one `UPDATE ... FROM unnest(...)` query rather than looping — also correctly handles duplicate component IDs in a single cart/items array.
- **DB reconnect resilience**: pool error handler + `tryReconnect()` + startup retry loop, with a `schemaReady` flag so `/api/health` and `checkDbConnection` middleware can't report healthy before tables actually exist.
- **Unlimited components**: `hasQuantityLimit: false` components skip all quantity math (both client-side cart limits and server-side `adjustStock`/`recalculateInventory` guards) and are always "Available".
- **No real-time transport** — "live" sync is client-side polling every 2s (`InventoryContext`), not websockets/SSE.
- **Session persistence** is just `sessionStorage` (key configurable via `VITE_SESSION_STORAGE_KEY`), no server-side session/JWT — so there's no way to invalidate a logged-in participant/admin from the server, and admin auth is a single shared secret rather than per-user accounts.

## 10. Feature checklist (as implemented in code, not just README claims)

**Participant**
- ✅ Team login (registration is admin-only — no participant self-registration)
- ✅ Browse components by category with live availability/status
- ✅ Cart-based multi-item request submission
- ✅ Request status tracking (Active/History/Cancelled tabs) incl. admin notes
- ✅ View currently-held vs. returned inventory

**Admin**
- ✅ Dashboard metrics (units, reserved, queue, ready, low-stock)
- ✅ Approve / modify (qty + add items + notes) / reject requests
- ✅ Release (mark collected) and reinstate (return to stock) flows
- ✅ Delete request history with automatic stock restoration
- ✅ Component CRUD incl. "unlimited stock" components
- ✅ Per-component "who collected this" audit view
- ✅ Team management: register (generates password), search, delete (cascading), per-team inventory view

**Cross-cutting**
- ✅ 2-second polling-based "live" sync across clients
- ✅ Stock reservation to prevent over-allocation, reconciled via `recalculateInventory`
- ✅ Decorative spark/particle animation on request submission and new-row arrival
- ⚠️ Gemini API key placeholder in `.env.example` — no actual AI feature is implemented anywhere in the code.
