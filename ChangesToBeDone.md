# Changes To Be Done

Open work items for the ELECTROHACK 2.0 inventory system. Sourced from the code review of
`origin/main...HEAD` plus the uncommitted working tree (Mongo→Postgres migration, server-side
admin secret, `requireAdmin` plumbing, participant-registration removal, framer-motion UI rework),
recorded 2026-09-17. §5 records a second review pass and the fixes applied for it — 1.1 and 1.7
below were resolved as part of that pass (see §5.3); everything else in §1–§4 is still open.

## 1. Correctness and security (backend)

Ordered by severity. Items 1 and 7 are two halves of the same over-allocation hole and should be
fixed together.

### 1.1 `POST /api/requests` validates nothing in `cart` — `server.js:440` — FIXED, see §5.3

The route is unauthenticated and performs no validation on the incoming cart. A negative
`quantity` drives `reserved_quantity` negative and fabricates stock out of nothing, and there is
no availability check whatsoever, so any team can reserve more units than exist.

**Fix:** reject non-integer, zero, and negative quantities; verify each `componentId` exists;
and check requested quantity against `total_quantity - reserved_quantity` inside the existing
transaction (the row is already locked there, so the check is race-free).

### 1.2 Case-variant team names can authenticate the wrong team — `server.js:407`

Uniqueness is checked with case-insensitive `ILIKE`, but the `teams.team_name` column carries a
byte-exact `UNIQUE` constraint. The two disagree, so case-variant names can coexist in the table.
Login then reads `rows[0]` from an unordered result set and can authenticate whichever row
Postgres happens to return first — a genuine authentication bug, not just a cosmetic one.

**Fix:** make the constraint and the lookup agree. Either add a `UNIQUE` index on
`lower(team_name)` (and match with `lower(team_name) = lower($1)`), or drop the case-insensitive
behaviour entirely. Same applies to `registration_number`.

### 1.3 `ROLLBACK` inside `catch` can hang the request — `server.js:477`

`await client.query('ROLLBACK')` in the `catch` block can itself throw when the connection is
already dead. That skips the `res.status(500)` below it, and because Express 4 does not catch
async handler rejections, the request never gets a response. Same pattern at `server.js:570`,
`624`, `666`, and `745`.

**Fix:** wrap the rollback in its own `try`/`catch` (log and swallow), so the 500 response is
always sent.

### 1.4 A single transient outage pins the API at 503 — `server.js:53`

`tryReconnect()` probes exactly once with no retry loop, and `/api/health` never re-probes on its
own. If that one probe fails, `dbConnected` stays false for the life of the process even after
Postgres comes back, so every gated route returns 503 until someone restarts the server.

**Fix:** give `tryReconnect()` a backoff retry loop (mirroring `connectAndInitSchema`'s existing
`setTimeout` retry), and/or let `/api/health` re-probe and clear the flag when the probe succeeds.

### 1.5 `seedAndSync()` swallows its own errors — `server.js:277`

The `try`/`catch` logs and returns, so `connectAndInitSchema` proceeds to set `schemaReady` and
`dbConnected` to true even when seeding and reservation recalculation both failed. `/api/health`
then reports healthy over a database that was never correctly initialised.

**Fix:** let the error propagate (or set a distinct failure flag) so startup does not report
ready on a failed seed.

### 1.6 Unlimited components accrue reservations that can never be released — `server.js:227`

`recalculateInventory` sets `reserved_quantity` for every component with active requests,
including unlimited ones, but `adjustStock` filters unlimited components out via
`WHERE has_quantity_limit = true`. Anything booked against an unlimited component is therefore
written once and never decremented.

**Fix:** add the same `has_quantity_limit = true` guard to `recalculateInventory`'s update so the
two functions agree on which components carry reservations.

### 1.7 Over-allocation warning is advisory only — `components/participant/Cart.tsx:201` — FIXED, see §5.3

The "Only N left — reduce to submit" line renders correctly when stock drops under an open cart,
but the Transmit button ignores `overAllocated` and stays enabled, and the server accepts the
request anyway (see 1.1).

**Fix:** disable the Transmit button while any line is over-allocated, and add the server-side
availability check from 1.1 so the client is not the only line of defence.

### 1.8 `PUT /api/components` silently inserts a duplicate — `server.js:678`

The route branches on `id && isValidUUID(id)`. When `id` is present but malformed, it falls
through to the INSERT branch and silently creates a second component instead of reporting the bad
input.

**Fix:** return 400 when `id` is present but fails `isValidUUID`.

## 2. Decisions to confirm (UI rework)

Two deliberate deviations from `UI_Build_Guide.md` / the build task, both flagged at the time and
still open:

- **Sync LED colour.** `UI_Build_Guide.md` §3 specifies a green "breathing" LED, but the build
  task reserves `emerald-500` exclusively for the active Transmit button, the active tab
  underline, and the in-stock dot. The hard constraint won: the LED in
  `components/common/Header.tsx` is white. Flip it if the guide should take precedence.
- **Stepper upper bound.** The task specified disabling `+` at `reservedQuantity >= totalQuantity`.
  That literal rule permits requesting more units than exist, so the implementation caps at
  `totalQuantity - reservedQuantity` (actual availability) instead.

## 3. Not yet verified

- **The rendered UI has never been looked at.** The framer-motion rework passes `tsc --noEmit`
  and `npm run build`, and the dev server, `/api/inventory`, and both logo URLs all return 200 —
  but no browser automation was available in the session that wrote it, so the spotlight cursor
  tracking, drawer feel, spring timings, and mobile layout are all unconfirmed. Run `npm run dev`
  and check by eye.
- **`tests/api.test.js` covers the API only.** There is no frontend test coverage at all.

## 4. Repo hygiene and dead code

- `components/participant/constants.ts` is dead `MOCK_COMPONENTS` / `MOCK_TEAMS` /
  `MOCK_REQUESTS` data, imported nowhere. The UI build task explicitly forbids mock data in the
  tree — recommend deleting the file.
- `Master Brand.zip` and `Master Brand/` are untracked at the repo root. The zip is redundant now
  that `assets/` holds the logos; it probably should not be committed.
- `assets/logo.ts` is a 0-byte file that `publicDir: 'assets'` copies into `dist/logo.ts` on every
  build. Delete it.
- The `index.html` importmap still declares server-side packages (`express`, `pg`, `cors`,
  `dotenv`, `path`, `url`, `vite`) that a browser never loads — leftovers from the pre-migration
  setup.
- **React version split:** `package.json` pins React 18 while the `index.html` importmap points at
  React 19 via esm.sh. Pick one; the mismatch affects which `framer-motion` version is correct.
- Admin and login pages still carry the old amber/gray styling. Only the global theme
  (`index.html`) and `Card.tsx` were retuned to the black + emerald system (the background itself
  is now the Galaxy shader, see §5.5), so the participant dashboard and the admin console
  currently look like two products.

## 5. Fixed — admin auth, over-allocation, mobile nav, dead code, reduced-motion (2026-09-17)

Sourced from an `/code-review [xhigh]` pass over the amber→emerald UI/motion rewrite plus the
admin-auth hardening change. All six are fixed as of this entry.

### 5.1 Admin auth failures were silent end-to-end — FIXED

`setAdminSecret` swallowed storage errors and every admin mutation call site swallowed the
resulting 401, so with site data blocked (or after an `ADMIN_SECRET` rotation) login succeeded,
the dashboard rendered fully via the unauthenticated `GET /api/inventory`, and "Confirm & Approve"
/ "Save Changes" then did nothing forever with no message and no redirect.

**Fix:** `server/api.ts`'s `createApiError` now detects a 401 on any admin-authenticated call,
clears the stored token, and fires an `onAdminUnauthorized` handler; `AuthContext` wires that
handler to force-logout with a message (`adminAuthMessage`), which `AdminLoginPage` surfaces on
the login screen. `RequestDetailView.tsx` and `InventoryManager.tsx`'s previously
`console.error`-only catches now also set visible inline error state.

### 5.2 Raw shared admin password cached in sessionStorage — FIXED

`electrohack_admin_secret` held the literal server-wide `ADMIN_SECRET`, not a per-session token;
one XSS or extension yielded permanent admin API access that couldn't be revoked without an env
edit + restart that kills all admin sessions.

**Fix:** `POST /api/admin/login` now exchanges the secret for a random opaque session token
(`crypto.randomBytes(32)`, 8-hour TTL, tracked server-side in `server.js`'s `adminSessions` map).
`requireAdmin` checks the token, not the secret. `POST /api/admin/logout` revokes it immediately.
The client stores the token (`electrohack_admin_token`) instead of the secret — the secret itself
never lands in sessionStorage after the initial exchange. Covered by
`tests/api.test.js`: "issues a session token", "revokes its token immediately", "invalid admin
token is rejected".

### 5.3 "Only N left" warning didn't block Transmit — FIXED

The button was disabled only on empty-cart/submitting, so an over-allocated submit could push
`reserved_quantity` past `total_quantity` and every participant's card would render a negative
"Available".

**Fix:** two-sided. `components/participant/Cart.tsx` now computes `hasOverAllocation` live from
`InventoryContext` and disables Transmit (relabelling it "Reduce Over-Allocated Items") while any
line exceeds availability. `server.js`'s `POST /api/requests` independently validates cart
quantities (positive integers, real UUIDs) and locks + checks each component's real availability
inside the transaction before reserving — the client-side check alone was bypassable via a direct
API call. Covered by 5 new tests in `tests/api.test.js` (negative/zero/fractional quantity,
malformed/nonexistent componentId, over-allocation returns 409 and reserves nothing).

### 5.4 No route to participant login on mobile — FIXED

"Participant Access" was `hidden sm:block` and the old mobile-only Login button had been deleted
in the UI rework, so a phone user on `/admin-login` had no way back to the participant flow.

**Fix:** dropped the `hidden sm:block` pair in `components/common/Header.tsx` — both nav links are
now always visible.

### 5.5 Dead background components — FIXED

`components/common/PcbCircuitField.tsx` (392 lines) was never imported, and
`components/common/BackgroundLines.tsx` was re-themed earlier in this session but became
unreachable once `App.tsx` switched to `GalaxyBackground`.

**Fix:** deleted both files. (Confirmed via repo-wide grep that neither was referenced anywhere
before deleting.)

### 5.6 Galaxy's reduced-motion path still rendered 60fps WebGL — FIXED

`disableAnimation` only froze `uTime`/`uStarSpeed`; the `requestAnimationFrame` loop and
`renderer.render()` kept running every frame regardless, so `prefers-reduced-motion` got a static
*image* in terms of shader content but the same GPU cost as full animation.

**Fix:** in the vendored `components/common/Galaxy.tsx`, the rAF reschedule now lives inside the
`!disableAnimation` branch — one frame renders and the loop stops, instead of running forever with
frozen uniforms. Noted in the file's "Local adaptations" provenance comment alongside the other
vendored changes.

## 6. Assets still missing

- `empty-queue-dark.png` — the admin queue empty state from `UI_Build_Guide.md`. Never
  materialised, and the admin queue was out of scope for the participant dashboard work. The
  participant-side equivalents (`empty-cart-dark.png`, `pcb-traces-mask.png`) were replaced with
  inline SVG (`components/participant/PcbTraces.tsx` and `EmptyCartArt` in `Cart.tsx`); the admin
  queue can use the same approach.

## 7. Feature: admin can re-view team credentials (2026-09-17)

Previously a team's password was shown once at registration and then never again — the UI
comment literally said "It cannot be recovered later." Admins asked to see it again had no
option but to delete and re-register the team.

**Added:** `GET /api/teams/:id/credentials` (admin-gated, `server.js`), a matching
`api.getTeamCredentials()` (`server/api.ts`), and a "Credentials" button on each team row in
`TeamManager.tsx` that opens the same reveal/copy panel used at registration, now also reachable
on demand. Covered by 3 new tests in `tests/api.test.js` (retrieve after registration, rejected
without an admin session, 404 for a nonexistent team).

### 7.1 Follow-up — team passwords were stored in plaintext — FIXED (2026-09-17)

Flagged above as a dependency of this feature, then fixed the same day: hashing was ruled out
because a one-way hash can't be shown back to an admin (it would turn this feature into "reset
password," not "reveal password"), so the fix is reversible **encryption at rest** instead.

**Fix:** `server.js` gained `encryptTeamPassword`/`decryptTeamPassword` (AES-256-GCM, random IV
per row, prefixed `enc1:` so old rows are distinguishable). The key is derived via `scrypt` from
`TEAM_PASSWORD_ENC_SECRET` if set, else from `ADMIN_SECRET` (documented in `.env.example`, with a
startup warning on the fallback path — rotating `ADMIN_SECRET` without a dedicated
`TEAM_PASSWORD_ENC_SECRET` would make every existing team password undecryptable). Registration
now stores the encrypted form; login decrypts and compares via the existing constant-time
`secretsMatch` helper instead of `team.password !== password`; the credentials-reveal endpoint
decrypts on the way out. Pre-existing plaintext rows keep working unmodified — `decryptTeamPassword`
passes through any value that doesn't carry the `enc1:` prefix, so no migration/re-registration is
needed for teams that already existed.

Covered by 2 new tests: one asserts the raw DB column starts with `enc1:` and isn't the plaintext
password; the other inserts a legacy plaintext row directly and confirms it can still log in.

## 8. Feature: block deleting a team that hasn't returned its components (2026-09-17)

`DELETE /api/teams/:id` used to restore `total_quantity` for any `COLLECTED` request the team
held and then delete the team unconditionally — silently treating "the team record is gone" as
"the hardware came back," even when it was still physically out with the team.

**Fix:** the route now checks for `COLLECTED` requests before touching anything. If any exist, it
rolls back and returns 409 with a `requests` array (per request: id, timestamp, and each item's
component name/category/quantity) instead of deleting. Nothing is deleted or restored until every
collected item has actually been reinstated.

**Client:** `server/api.ts` gained `TeamHasUnreturnedComponentsError` (carries the same
per-request breakdown) so `deleteTeam()` throws something structured instead of a generic string.
`TeamManager.tsx` checks locally first — off the already-polled `requests` in `InventoryContext`,
so the common case is instant with no round trip — and falls back to catching the same error from
the server for the rare race (something got collected between page load and the delete click). Either
path opens a "Cannot Delete Team" modal listing exactly which components from which requests are
still outstanding, each with a "Reinstate →" link straight to that request's detail page (where
"Reinstate Inventory" already exists for `COLLECTED` requests).

Covered by 1 new test: register a team, collect a request, confirm delete is blocked with a 409 and
the correct component/quantity in the response, confirm the team/request/stock are all untouched by
the blocked attempt, then confirm deletion succeeds normally after reinstating.

## 9. Feature: reinstatement requires a confirmation card with the returner's name and reg number (2026-09-17)

"Reinstate Inventory" (returning collected components to stock) used a bare `window.confirm()`
with no record of who actually handed the components back — the receipt only said the admin
clicked a button, not who was standing there returning the hardware.

**Fix:** `PATCH /api/requests/:id/reinstate` (`server.js`) now requires a `returnedBy: { name,
registrationNumber }` body and rejects with 400 if either is missing — enforced server-side, not
just by the UI, matching this project's established client-check-plus-server-enforcement pattern.
On success it appends `Returned by {name} (Reg: {registrationNumber}) on {ISO timestamp}` to the
request's `notes` (existing notes are preserved above it, not overwritten).

**Client:** `RequestDetailView.tsx`'s "Reinstate Inventory" button now opens a "Confirm
Reinstatement" modal instead of firing directly. It shows the team's name/registration number on
file for reference, requires Name and Registration Number to be filled in before "Confirm Return"
enables, and shows a non-blocking amber warning if the entered registration number doesn't match
the team's — informational (typos happen), not a hard block. `server/api.ts` and
`InventoryContext.tsx`'s `reinstateInventory()` signatures both now take the `returnedBy` object
and thread it through.

Covered by 3 tests: reinstating without `returnedBy` is rejected (400), reinstating with it
succeeds and the notes field actually contains the "Returned by …" line, and the existing
"not COLLECTED" rejection test now supplies a valid `returnedBy` so it's actually testing the
status check rather than the new validation.

## 10. Feature: Excel export for requests, on approval and on collection (2026-09-17)

Two export points, both client-side (no new backend routes — everything needed is already in
`InventoryContext`):

- **Per-request report.** `RequestDetailView.tsx` (the page an admin approves/releases/reinstates
  a request from) gained a "Generate Excel Report" button, always visible regardless of status.
  It produces a two-sheet workbook: a Summary sheet (request id, team name, leader, registration
  number, status, submitted-at, notes) and an Items sheet (component, category, quantity).
- **Bulk report.** `RequestList.tsx` — the table backing the admin dashboard's Queue, Approved,
  and History tabs — gained an "Export to Excel" button that exports whatever is currently
  filtered (e.g. the Approved tab covers the "which teams are ready for collection" case) as one
  flat sheet, one row per request-item: team, leader, reg #, component, category, quantity,
  status, submitted-at, notes.

Both go through `utils/excelExport.ts` (`exportRequestReport`, `exportRequestsReport`), built on
SheetJS. Two implementation details worth flagging:

- **Dependency source.** The `xlsx` package on the public npm registry is stuck at 0.18.5, which
  carries two published high-severity CVEs (prototype pollution, ReDoS) that SheetJS fixed in
  later releases but never republished to npm — their own advisories point to their CDN instead.
  `package.json` installs from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` rather than
  the bare `"xlsx"` npm spec, to actually get the patched code. (Exploitability here was already
  near-zero either way — both CVEs are in the *parsing* path for untrusted files, and this feature
  only *writes* data the app generated itself — but there was no reason to ship a flagged version
  when the fix was one install command away.)
- **Bundle size.** `xlsx` is ~500KB and only used behind two buttons most users never click, so
  both export functions are `async` and load it via `import('xlsx')` inside the function body
  rather than a top-level import — Vite splits it into its own chunk (confirmed in the build
  output: a separate `xlsx-*.js` chunk, fetched only on first export), instead of adding ~350KB to
  every user's initial page load.

`item.component` is read defensively (`item.component?.name ?? 'Unknown component'`) in both
export functions even though `RequestItem.component` is typed as always-present — the API can send
`component: null` for a request whose component was later deleted, the same gap `Cart.tsx` already
guards against.

## 11. Feature: delete a resource in Manage Resources, with confirmation and team notification (2026-09-17)

There was no way to delete a component at all before this — only add/edit (`PUT /api/components`).
Deleting one needed to handle two different situations a component can be in when removed:
physically out with a team right now, versus just sitting in someone's pending cart.

**Backend — new `DELETE /api/components/:id`** (`server.js`, admin-gated):
- **Still physically collected by any team → hard block.** Returns 409 with a `holders` array
  (per holder: request id, team name/leader/reg#, quantity, timestamp) — mirrors the team-deletion
  guard from §8 exactly, just component-centric instead of team-centric. Nothing is deleted or
  restored until every holder has actually returned it.
- **Referenced only by active (not-yet-collected) requests → notify, then delete.** For each such
  request, the specific line item is removed and a note is appended: `"{name}" was removed from
  inventory by an admin on {timestamp} and could not be provided for this request.` That's the
  closest thing this polling-based app has to a push notification — `RequestHistory.tsx` already
  renders `request.notes` to the participant, refreshed every 2s, so no new UI surface was needed
  on that side.
- **Referenced only by terminal (rejected/returned) requests → left alone.** Forcing every
  historical rejected/returned request to be manually cleaned up before a component could ever be
  deleted would make deletion nearly impossible on any inventory with real usage history.

**Schema change required this:** `request_items.component_id` had no `ON DELETE` behavior
(defaults to `RESTRICT` in Postgres), so deleting a component with *any* historical
`request_items` row referencing it — even from a rejected request from hours ago — would throw a
foreign-key violation. Changed to `ON DELETE SET NULL` (both the `CREATE TABLE` DDL for fresh
installs and an idempotent `ALTER TABLE ... DROP/ADD CONSTRAINT` in `initSchema()` for the
already-running dev DB — confirmed via `\d request_items` in psql that the constraint picked it up
without a restart-and-hope). The API and frontend already treated a null `component_id` as
"Unknown component" / "Component no longer available" (`Cart.tsx`, the new Excel export in §10),
so this closes a gap that was evidently anticipated but never wired up.

**Client:** `server/api.ts` gained `ComponentStillHeldError` (carries the holder list, same
pattern as `TeamHasUnreturnedComponentsError`). `InventoryManager.tsx` gained a "Delete" button per
row that checks locally first (off already-polled `requests`, instant, no round trip) and falls
back to catching the same error from the server for the rare race. Blocked deletes open a "Cannot
Delete Resource" modal listing each holder with a "Reinstate →" link to that request. Clear-to-delete
opens a "Confirm Deletion" card (see §11.1) that also previews how many pending requests will be
notified, then a success banner naming how many teams were actually notified.

Verified live against the running dev server, not just the test suite: created a component via the
real HTTP API, deleted it, and confirmed via a fresh `GET /api/inventory` that it's actually gone.

### 11.1 Follow-up — deletion now requires a confirmation card with the deleting admin's name and reg number (2026-09-17)

Same day, same pattern as §9: the "clear to delete" path used a bare `window.confirm()`, so there
was no record of *who* authorized a resource's removal — only that someone clicked a button.

**Fix:** `DELETE /api/components/:id` (`server.js`) now requires a `deletedBy: { name,
registrationNumber }` body and rejects with 400 if either is missing — enforced server-side, not
just by the UI. On success, that identity is threaded into the same notice teams see (`"{name}"
was removed from inventory by {deletedByName} (Reg: {deletedByRegNum}) on {timestamp}...`) and
also `console.log`'d server-side as a durable-ish audit line for the case where zero requests were
affected (nowhere else survives that, since the component row itself is gone).

**Client:** `InventoryManager.tsx`'s `window.confirm` was replaced with a proper "Confirm Deletion"
modal — mirrors `RequestDetailView.tsx`'s reinstate confirmation exactly: shows the affected-request
count as a warning inside the card, requires Name and Registration Number before "Delete Resource"
enables, and keeps the card open with an inline error on failure instead of closing and losing
context. `server/api.ts` and `InventoryContext.tsx`'s `deleteComponent()` signatures both now carry
the `deletedBy` object through.

Verified live: a DELETE call without `deletedBy` returns the 400 rejection message; the same call
with it succeeds and echoes `deletedBy`/`deletedAt` back in the response. All 6 delete-component
tests updated to supply `deletedBy` (since the route now validates it before reaching the
holders/notify logic those tests exercise), plus 1 new test asserting the missing-credentials
rejection and that it leaves the component untouched. Full suite: 52/52.

## 12. Feature: "Delete History" gets a proper warning card too (2026-09-17)

The last remaining `window.confirm()` on the admin side: `RequestDetailView.tsx`'s "Delete
History" button (deletes a request record entirely — `DELETE /api/requests/:id`) still used a
generic native popup with the same text regardless of what deleting would actually do to stock.

**Fix:** replaced with a "Delete Request History" card (`Modal`, matching the Reinstate and
Confirm Deletion cards already on this page). The warning text is now status-aware, describing
what actually happens rather than a generic line — mirroring the same branches
`DELETE /api/requests/:id` uses server-side:
- `COLLECTED` → warns the team is currently holding these components and deleting will restore
  them to available stock *as if returned*, without any confirmation from the team.
- Pending/Modified/Approved → warns it will release the request's reserved stock.
- Rejected/Returned → notes there's no remaining stock impact.

Unlike §9 and §11.1, this one intentionally does **not** require a name/registration number —
that wasn't asked for here, and inventing an extra credential requirement beyond what the user
requested would be scope creep for a UI-only confirmation change. On failure the card stays open
with an inline error instead of closing and losing context, same pattern as the other two modals
on this page.

Frontend-only change — no API contract change (`handleAction('delete')` still calls the existing
`deleteRequest`), so no new backend tests were needed; the existing
`DELETE /api/requests/:id` test coverage already exercises that endpoint directly. Full suite still
52/52, `tsc --noEmit` and `npm run build` clean.

## 13. Feature: durable Postgres audit log for admin-identity actions (2026-09-17)

Before this, "who authorized this" lived only as transient text — appended to a specific
request's `notes` (reinstate, delete-component-when-active-requests-exist) or a `console.log` line
that scrolled away (delete-component with nothing affected). None of it was queryable, and delete
history had no credential capture at all, so it had no record whatsoever.

**New table** (`server.js`'s `initSchema()`): `audit_log(id, action, actor_name,
actor_registration_number, target_type, target_id, details JSONB, created_at)`. No FK on
`target_id` — deliberately: the target can be a request or a component, and for a deletion the
target row is gone by the time the log is read back, which is the entire point of an audit log
surviving what it describes. `recordAuditLog()` inserts inside the same transaction as the action
it records, so the entry and the action commit or roll back together — never "the delete happened
but nothing was logged" or vice versa.

**Wired into all three admin-identity actions:**
- `PATCH /api/requests/:id/reinstate` → `REINSTATE_REQUEST`, details include team name/id and the
  returned items.
- `DELETE /api/components/:id` → `DELETE_COMPONENT`, details include the component name/category
  and which teams got notified.
- `DELETE /api/requests/:id` (Delete History) → **this action never required an admin identity
  before** — extended to require `deletedBy: { name, registrationNumber }` (400 if missing) the
  same way the other two already did, closing what would otherwise have been a gap in the audit
  trail. `RequestDetailView.tsx`'s "Delete Request History" card gained the same Name/Registration
  Number fields as the Reinstate card as a result — `server/api.ts` and
  `InventoryContext.tsx`'s `deleteRequest()` now carry `deletedBy` through.

**Retrieval:** new `GET /api/audit-log?limit=` (admin-gated, default 100, max 500, newest first).
`server/api.ts` gained a typed `getAuditLog()` and an exported `AuditLogEntry` interface. No UI
page consumes it yet — the data is there and queryable (via the API or directly in Postgres), but
building an admin-facing audit log *view* wasn't asked for here; flagging it as a natural next step
if wanted, rather than building it unprompted.

Verified at every layer, not just the test suite: `\d audit_log` in psql confirms the live schema;
a real HTTP delete-component call followed by a real HTTP call to `/api/audit-log` shows the entry;
a direct `SELECT` against Postgres shows the same row. Plus 7 new/updated automated tests: the
audit-log endpoint's own auth check, an end-to-end test asserting all three action types appear
with the correct actor identity, and updated coverage for `DELETE /api/requests/:id` now requiring
`deletedBy`. One test-suite bug caught and fixed before it shipped: the new
"missing-`deletedBy`-is-rejected" test left a real pending request with reserved stock behind
(since a 400 correctly leaves it untouched) with no cleanup, which silently broke two *later*
tests' exact-value `reservedQuantity` assertions — running the full suite (not just the new tests
in isolation) caught it immediately. Full suite: 55/55.

## 14. Feature: partial returns (2026-09-17)

Reinstate used to be all-or-nothing — collect 5 units, and the only option was returning all 5 at
once, flipping the whole request straight to `RETURNED_TO_INVENTORY`. There was no way to return
2 of 5 and keep the other 3 checked out, and "Collected"/"Returned" totals everywhere were computed
by bucketing entire requests by status rather than tracking quantities per item.

**Schema:** `request_items` gained `returned_quantity INTEGER NOT NULL DEFAULT 0` (cumulative units
returned so far, `quantity` stays the original collected amount). `GET /api/inventory` now sends
`returnedQuantity` on every `RequestItem`; `types.ts` updated to match, non-optional since the
column always defaults to 0.

**`PATCH /api/requests/:id/reinstate` rewritten:** now accepts an optional `items: [{componentId,
quantity}]` — the amount of each component being handed back *in this specific action*. Omitting
it (the common case) defaults to returning everything still outstanding, so a full return still
needs zero extra input. Validates each requested quantity against what's actually still
outstanding (400 if over). Applies `adjustStock` for only the amounts being returned *now* (not the
full original quantities — crediting the full amount on a second partial return would double-count
what an earlier partial return already restored), increments `returned_quantity` per item, then
recomputes status: stays `COLLECTED` if anything is still outstanding on *any* item, flips to
`RETURNED_TO_INVENTORY` only once every item's `returned_quantity` has caught up to its `quantity`.
Each return action appends its own dated receipt line to `notes` (so multiple partial returns leave
a readable trail of exactly what came back when), and the audit log entry (§13) now records exactly
which items/quantities were part of *this* action, not the request's full original contents.

**Three places that assumed "Collected = fully outstanding" needed the same fix**, since a
partially-returned request can now have a `COLLECTED` status with some items already returned:
- `DELETE /api/requests/:id` — was crediting the *full original quantity* back to `total_quantity`
  regardless of what a prior partial return already restored. Now restores only
  `quantity - returned_quantity` per item.
- `DELETE /api/components/:id`'s "still held" check — now filters on
  `quantity > returned_quantity` per item (not just the request's status) and reports the actual
  outstanding amount, since one component on a `COLLECTED` request can be fully returned while
  another on the same request isn't.
- `DELETE /api/teams/:id`'s "still held" check — same fix, same reasoning.

**"Once returned, the option shouldn't be available again"** falls out of the status model directly:
`RequestDetailView.tsx`'s "Reinstate Inventory" button was already gated on
`status === Collected`, so once every item is fully returned and the status flips, the button
disappears on the next poll with no extra code needed.

**UI:** `RequestDetailView.tsx`'s item table now shows Collected/Returned/Outstanding columns
instead of the requested/adjusted-qty columns once a request reaches Collected or Returned. The
Reinstate card is no longer a single confirm — it lists each outstanding item with a quantity
stepper (defaulting to the full outstanding amount, adjustable down for a partial return) alongside
the existing Name/Registration Number fields; the confirm button reads "Confirm Partial Return (N)"
instead of "Confirm Return" when less than everything is selected. A partial return no longer
navigates back to the dashboard afterward (the request is still live and worth looking at); a full
return still does. `TeamManager.tsx`'s "Team Inventory" modal, `CollectedComponents.tsx` (the
participant "My Inventory" tab), and `InventoryManager.tsx`'s "Collections" modal were all rewritten
from bucketing whole requests by status to summing `quantity - returnedQuantity` into "collected"
and `returnedQuantity` into "returned" per item — matching the user's own example exactly: borrow 5,
return 2 → Collected shows 3, Returned shows 2; return the last 3 → Collected shows 0, Returned
shows 5.

**Also deleted** `components/participant/constants.ts` — dead mock data flagged back in §4, and the
`returnedQuantity` type change finally forced the issue (it didn't type-check against the updated
`RequestItem` interface, confirming again that nothing imports it).

Verified live end-to-end against the running server, not just the test suite: collected 5 units of
a real component on a real team, returned 2 (confirmed `status` stayed `COLLECTED`,
`returnedQuantity: 2`), returned the remaining 3 (confirmed `status` flipped to
`RETURNED_TO_INVENTORY`, two separate dated receipt lines in `notes`), then confirmed reinstating
again was rejected outright. Cleaned up the test request afterward. Plus 6 new automated tests:
the full partial-then-full-return flow with status assertions at each step, over-returning is
rejected, and — critically — that a partially-returned request still correctly blocks team/component
deletion while reporting only the outstanding amount (not the original quantity), and that deleting
a partially-returned request restores only what's still outstanding (proving the double-counting
fix actually works, not just that it compiles). Full suite: 59/59, `tsc --noEmit` and
`npm run build` clean.

## 15. Feature: team deletion gets the same credential card + audit trail (2026-09-17)

The fourth destructive admin action, and the last one still using a bare `window.confirm()`:
`DELETE /api/teams/:id` had no credential capture and no audit trail at all — reinstate,
delete-component, and delete-request-history all already required a name/reg# (§9, §11.1, §13),
but team deletion was the one gap left.

**Backend:** `DELETE /api/teams/:id` now requires `deletedBy: { name, registrationNumber }` (400 if
missing), same enforcement pattern as the other three. On success it records a `DELETE_TEAM` entry
in `audit_log` (§13's table) with `targetType: 'team'` and details capturing the team's name,
leader, registration number, and how many requests were cascade-deleted with it. `AuditLogEntry`'s
`action`/`targetType` unions in `server/api.ts` extended to include it.

**Client:** `TeamManager.tsx`'s `window.confirm` was replaced with a "Confirm Deletion" card —
same shape as `InventoryManager.tsx`'s Confirm Deletion modal (§11.1): Name and Registration
Number fields gate the Delete Team button, inline error stays visible in the card on failure
instead of closing it, and the existing "Cannot Delete Team" block-modal (§8, for teams still
holding collected components) is untouched — it's a separate, earlier gate that still fires first.
`api.deleteTeam()` now takes the `deletedBy` object.

This closes the pattern started with reinstate: **all four** destructive/accountability-sensitive
admin actions (reinstate, delete component, delete request history, delete team) now require and
durably record who authorized them, not just three of four.

Verified live against the running server: a delete without credentials returns the 400 rejection;
the same call with credentials succeeds; `GET /api/audit-log` shows the `DELETE_TEAM` entry with
the right actor identity; a direct Postgres `SELECT` confirms the same row independently. Plus 3
new/updated tests: missing-credentials rejection (and that it leaves the team untouched), and the
audit log test extended to also assert a `DELETE_TEAM` entry exists with `targetType: 'team'` and
populated `details.teamName`. All prior team-deletion tests (blocked-while-collected, cascading
delete, 404 for nonexistent) updated to supply `deletedBy` so they still exercise what they were
written to test, rather than tripping the new 400 first. Full suite: 60/60.

## 16. Fixed — live `.env` was missing `TEAM_PASSWORD_ENC_SECRET` (2026-09-17)

`.env.example` documented `TEAM_PASSWORD_ENC_SECRET` (§7.1) as an optional-but-recommended
setting, but the actual `.env` this dev server runs on never got it — meaning the server was
still deriving the team-password encryption key from `ADMIN_SECRET`'s current value, exactly the
fallback path the code comments warn about: rotate `ADMIN_SECRET` and every already-registered
team's password becomes permanently undecryptable.

**Fix:** added `TEAM_PASSWORD_ENC_SECRET` to `.env`, set to the *same string* `ADMIN_SECRET`
currently holds. This was the only safe value to use — the dev DB already had a real team
("Malai Chaap") with a password encrypted under the fallback-derived key; setting
`TEAM_PASSWORD_ENC_SECRET` to anything else would have made that password permanently
undecryptable the moment the server restarted with the new value. Matching the current
`ADMIN_SECRET` keeps the derived key byte-identical, so nothing breaks, while pinning it
independently from here on — `ADMIN_SECRET` can now be rotated later without taking existing team
passwords down with it.

Verified, not assumed: checked the startup log for the "TEAM_PASSWORD_ENC_SECRET is not set"
fallback warning (gone), and called `GET /api/teams/:id/credentials` for the real existing team
after restarting — it still decrypted to the same password format, confirming the key derivation
genuinely didn't change. Full test suite re-run for good measure (spawns its own server with its
own env overrides, so unaffected either way): 60/60. `.env` is gitignored, so the value never
reaches version control.

## 17. Feature: Audit Log admin UI (2026-09-17)

§13 built the `audit_log` table and `GET /api/audit-log`, and `server/api.ts` already had a typed
`getAuditLog()` — but nothing in the React app ever called it. Asked directly whether there was
"any provision" to check this from the website, and there genuinely wasn't: the data was real and
queryable, just invisible outside `psql` or a raw `curl`.

**Added:** `components/admin/AuditLog.tsx`, wired in as a new "Audit Log" tab on the admin
dashboard (`AdminDashboardPage.tsx`). Fetched on demand via a Refresh button rather than through
`InventoryContext`'s 2s poll — this is an audit trail, not live inventory state, so a background
timer polling it every 2 seconds would be pointless load for data that only changes on a handful
of deliberate admin actions. Shows, per entry: a color-coded action badge (green for Reinstate,
red for the three deletions), who authorized it (name + reg #), a human-readable summary, and the
timestamp.

The four actions store different `details` JSON shapes (see §13/§15's `recordAuditLog` calls), so
`summarizeDetails()` branches per `action` to surface the most useful fields each one actually
has, rather than dumping raw JSON in the table — e.g. Reinstate shows units returned and whether
it was a full or partial return; Delete Team shows the leader name and how many requests went with
it. A "View →" link back to the request only appears for `REINSTATE_REQUEST` entries — the other
three actions delete their target, so `targetId` no longer resolves to anything and a link there
would 404.

Verified: `tsc --noEmit` and `npm run build` clean, dev server serves the new module (confirmed via
a direct request, not just assumed), full test suite still 60/60 (frontend-only change, no backend
touched, so no restart needed — Vite hot-reloads).

## 18. Feature: team roster with min/max size and a one-way admin-only lock (2026-09-17)

Previously a "team" was just its leader — no way to record the other participants on a team at
all. Added a `team_members` table so a team can hold 3–4 total participants (leader + 2–3
members), self-managed by the team until they choose to finalize it, after which only an admin can
touch it — and, matching every other destructive/accountability-sensitive admin action this
session (§9, §11.1, §13, §15), that admin change is credentialed and audit-logged.

**Schema:** `team_members (id, team_id → teams.id ON DELETE CASCADE, name, added_at)`, plus
`teams.roster_locked BOOLEAN DEFAULT FALSE`, both via idempotent `CREATE TABLE IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS` migrations in `initSchema()`. `MIN_TEAM_SIZE = 3`, `MAX_TEAM_SIZE = 4`
(counting the leader).

**Backend — three new routes, all in `server.js`:**
- `POST /api/teams/:id/members` and `DELETE /api/teams/:id/members/:memberId` share one rule: open
  (no admin token needed) while `roster_locked` is false — this is the team's own leader managing
  their own roster, trusted the same way `POST /api/requests` already trusts a client-supplied
  `teamId` — but once `roster_locked` is true, both require a valid admin session token, reject
  with 403 otherwise, and additionally require `changedBy: { name, registrationNumber }` (400 if
  missing) which gets written to `audit_log` as `ADD_TEAM_MEMBER` / `REMOVE_TEAM_MEMBER`. Adding is
  also rejected at 400 if it would push the total past `MAX_TEAM_SIZE`, independent of lock state.
- `POST /api/teams/:id/lock` is always open (it's the leader's own one-way action) and rejects at
  400 if the team is already locked, or if total participants fall outside 3–4.
- `GET /api/inventory` and `POST /api/teams/login` both now fetch and attach each team's members.

**Frontend:** `TeamMember` type and `Team.members` / `Team.rosterLocked` fields added to
`types.ts`. New `components/participant/TeamRoster.tsx` — a "My Team" tab on the participant
dashboard (`ParticipantDashboardPage.tsx`) where the leader adds/removes members and hits
"Finalize Team" (confirmed via a Modal, disabled until 3–4 total) once satisfied; after that it
shows a read-only "Roster Locked" state. New "Roster" button per team row in
`TeamManager.tsx` opens a "Manage Roster" modal for admins — a single Name/Registration Number
pair gates every add/remove action taken while it's open, rather than a separate confirm card per
action (lower stakes than a full team deletion). `server/api.ts` got `addTeamMember`,
`removeTeamMember`, `lockTeamRoster`, and `AuditLogEntry['action']` extended with the two new
action types; `AuditLog.tsx`'s label/style/summary maps updated to match (caught immediately by
`tsc --noEmit`'s `Record<...>` exhaustiveness check when they were missing).

Verified: `tsc --noEmit` and `npm run build` clean. 15 new tests added to `tests/api.test.js`
covering open add/remove while unlocked, the max-4 rejection, the min-3 lock rejection, locking
twice, open access being 403'd once locked, admin access requiring `changedBy` (400 without it),
successful admin add/remove on a locked roster, both new audit-log action types appearing with the
right actor and `targetType: 'team'`, and 404s for a nonexistent team on both routes — full suite
75/75. Also exercised live against the real dev server and the one real team ("Malai Chaap"): added
two members, hit the min-3 lock threshold successfully, confirmed the open-add path now correctly
403s once locked, removed both members and reset `roster_locked` back to `false` directly in
Postgres afterward (there's no unlock endpoint by design — locking is meant to be one-way for a
real team, so this direct-SQL revert was a deliberate undo of the live test's own side effect, not
a feature), and confirmed via `audit_log` that the admin-path cleanup calls really were recorded
with the right actor identity.
