import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TEST_PORT = 3999;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const ADMIN_DATABASE_URL = process.env.TEST_ADMIN_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = 'embedcontrol_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const TEST_ADMIN_SECRET = 'test-admin-secret-123';

let serverProcess;
let serverLogs = '';
let adminToken;

async function resetTestDatabase() {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await adminPool.end();
  }
}

// The server starts listening before its schema/seed setup finishes, so poll
// a real query-dependent endpoint (not just /api/health) until it succeeds.
async function waitUntilReady(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/inventory`);
      if (res.ok) {
        const data = await res.json();
        if (data.components && data.components.length > 0) return;
      }
    } catch {
      // server not up yet
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Server did not become ready in time.\n--- server output ---\n${serverLogs}`);
}

before(async () => {
  await resetTestDatabase();

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, PORT: String(TEST_PORT), NODE_ENV: 'test', ADMIN_SECRET: TEST_ADMIN_SECRET },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', d => { serverLogs += d.toString(); });
  serverProcess.stderr.on('data', d => { serverLogs += d.toString(); });

  await waitUntilReady();

  // Admin routes are gated by a session token (exchanged for ADMIN_SECRET at
  // login), not the raw secret itself — log in once and reuse the token for
  // every admin-only call the rest of the suite makes.
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: TEST_ADMIN_SECRET })
  });
  ({ token: adminToken } = await loginRes.json());
});

after(async () => {
  if (serverProcess) serverProcess.kill();
  await resetTestDatabase();
});

// --- helpers ---
// put/patch/del all hit admin-only routes in this app, so they carry the admin
// session token by default (read live, since `before()` sets `adminToken` after
// these are defined); `*Unauth` variants let tests assert the routes reject
// requests that omit or misstate it.
const adminHeader = () => ({ 'x-admin-token': adminToken });
const api = {
  get: (p) => fetch(`${BASE_URL}${p}`),
  getAdmin: (p) => fetch(`${BASE_URL}${p}`, { headers: { ...adminHeader() } }),
  post: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  // Team registration is admin-only (there is no participant self-registration flow).
  postAdmin: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeader() }, body: JSON.stringify(body) }),
  put: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...adminHeader() }, body: JSON.stringify(body) }),
  patch: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...adminHeader() }, body: body ? JSON.stringify(body) : undefined }),
  del: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...adminHeader() }, body: body ? JSON.stringify(body) : undefined }),
  putUnauth: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchUnauth: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  delUnauth: (p) => fetch(`${BASE_URL}${p}`, { method: 'DELETE' })
};

const getInventory = async () => (await api.get('/api/inventory')).json();
const findComponent = (components, name) => components.find(c => c.name === name);

let registeredPassword;
let teamId;
let arduinoId;

// ---------------------------------------------------------------------------
// Health & seeding
// ---------------------------------------------------------------------------

test('health check reports connected database', async () => {
  const res = await api.get('/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.database.connected, true);
});

test('inventory seeds the 4 starter components with zero reservations', async () => {
  const { components, teams, requests } = await getInventory();
  assert.equal(components.length, 4);
  assert.deepEqual(teams, []);
  assert.deepEqual(requests, []);

  const arduino = findComponent(components, 'Arduino Uno');
  assert.ok(arduino, 'Arduino Uno should be seeded');
  assert.equal(arduino.totalQuantity, 20);
  assert.equal(arduino.reservedQuantity, 0);
  assert.equal(arduino.hasQuantityLimit, true);
  arduinoId = arduino.id;
});

// ---------------------------------------------------------------------------
// Team registration & login
// ---------------------------------------------------------------------------

test('registering a team returns a generated password', async () => {
  const res = await api.postAdmin('/api/teams/register', {
    teamName: 'Circuit Breakers',
    leaderName: 'Aryan',
    registrationNumber: 'REG-100'
  });
  assert.equal(res.status, 201);
  const team = await res.json();
  assert.equal(team.teamName, 'Circuit Breakers');
  assert.equal(team.registrationNumber, 'REG-100');
  assert.equal(typeof team.password, 'string');
  assert.equal(team.password.length, 8);

  registeredPassword = team.password;
  teamId = team.id;
});

test('the stored password is encrypted at rest, not plaintext', async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const { rows } = await pool.query('SELECT password FROM teams WHERE id = $1', [teamId]);
    assert.ok(rows[0].password.startsWith('enc1:'), 'stored value should carry the encryption prefix');
    assert.notEqual(rows[0].password, registeredPassword);
  } finally {
    await pool.end();
  }
});

test('registering with a duplicate team name (case-insensitive) is rejected', async () => {
  const res = await api.postAdmin('/api/teams/register', {
    teamName: 'circuit breakers',
    leaderName: 'Someone Else',
    registrationNumber: 'REG-101'
  });
  assert.equal(res.status, 409);
});

test('registering with a duplicate registration number is rejected', async () => {
  const res = await api.postAdmin('/api/teams/register', {
    teamName: 'Another Team',
    leaderName: 'Someone Else',
    registrationNumber: 'reg-100'
  });
  assert.equal(res.status, 409);
});

test('registering with missing fields is rejected', async () => {
  const res = await api.postAdmin('/api/teams/register', { teamName: 'Incomplete Team' });
  assert.equal(res.status, 400);
});

test('logging in with correct credentials succeeds and omits the password', async () => {
  const res = await api.post('/api/teams/login', { teamName: 'Circuit Breakers', password: registeredPassword });
  assert.equal(res.status, 200);
  const team = await res.json();
  assert.equal(team.id, teamId);
  assert.equal(team.password, undefined);
});

test('admin can retrieve a team\'s credentials after registration', async () => {
  const res = await api.getAdmin(`/api/teams/${teamId}/credentials`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.teamName, 'Circuit Breakers');
  assert.equal(body.password, registeredPassword);
});

test('retrieving credentials without an admin session is rejected', async () => {
  const res = await fetch(`${BASE_URL}/api/teams/${teamId}/credentials`);
  assert.equal(res.status, 401);
});

test('retrieving credentials for a nonexistent team returns 404', async () => {
  const res = await api.getAdmin('/api/teams/00000000-0000-0000-0000-000000000000/credentials');
  assert.equal(res.status, 404);
});

test('logging in with the wrong password is rejected', async () => {
  const res = await api.post('/api/teams/login', { teamName: 'Circuit Breakers', password: 'wrong-password' });
  assert.equal(res.status, 401);
});

test('logging in as a nonexistent team is rejected', async () => {
  const res = await api.post('/api/teams/login', { teamName: 'Ghost Team', password: 'whatever' });
  assert.equal(res.status, 404);
});

test('a team registered before password encryption (legacy plaintext row) can still log in', async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query(
      'INSERT INTO teams (team_name, leader_name, registration_number, password) VALUES ($1, $2, $3, $4)',
      ['Legacy Plaintext Team', 'Old Leader', 'REG-LEGACY', 'plain-old-password']
    );
  } finally {
    await pool.end();
  }

  const res = await api.post('/api/teams/login', { teamName: 'Legacy Plaintext Team', password: 'plain-old-password' });
  assert.equal(res.status, 200);
  const team = await res.json();
  assert.equal(team.teamName, 'Legacy Plaintext Team');
});

// ---------------------------------------------------------------------------
// Admin login (secret lives server-side in ADMIN_SECRET, never sent to the client)
// ---------------------------------------------------------------------------

test('admin login with the correct secret succeeds and issues a session token', async () => {
  const res = await api.post('/api/admin/login', { password: TEST_ADMIN_SECRET });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.token, 'string');
  assert.ok(body.token.length > 0);
});

test('admin login with an incorrect secret is rejected', async () => {
  const res = await api.post('/api/admin/login', { password: 'not-the-secret' });
  assert.equal(res.status, 401);
});

test('admin login with a missing password is rejected', async () => {
  const res = await api.post('/api/admin/login', {});
  assert.equal(res.status, 400);
});

test('logging out an admin session revokes its token immediately', async () => {
  const loginRes = await api.post('/api/admin/login', { password: TEST_ADMIN_SECRET });
  const { token } = await loginRes.json();

  const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
    method: 'POST',
    headers: { 'x-admin-token': token }
  });
  assert.equal(logoutRes.status, 200);

  const res = await fetch(`${BASE_URL}/api/components`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ name: 'Rogue Part', category: 'Modules', totalQuantity: 1 })
  });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Admin-only routes reject requests that don't prove an admin session
// (previously these mutated data for anyone, with no credential at all)
// ---------------------------------------------------------------------------

test('creating a component without an admin session is rejected', async () => {
  const res = await api.putUnauth('/api/components', { name: 'Rogue Part', category: 'Modules', totalQuantity: 1 });
  assert.equal(res.status, 401);
});

test('creating a component with an invalid admin token is rejected', async () => {
  const res = await fetch(`${BASE_URL}/api/components`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'not-a-real-token' },
    body: JSON.stringify({ name: 'Rogue Part', category: 'Modules', totalQuantity: 1 })
  });
  assert.equal(res.status, 401);
});

test('updating a request status without an admin session is rejected', async () => {
  const res = await api.patchUnauth('/api/requests/00000000-0000-0000-0000-000000000000', { status: 'REJECTED' });
  assert.equal(res.status, 401);
});

test('reinstating a request without an admin session is rejected', async () => {
  const res = await api.patchUnauth('/api/requests/00000000-0000-0000-0000-000000000000/reinstate');
  assert.equal(res.status, 401);
});

test('deleting a request without an admin session is rejected', async () => {
  const res = await api.delUnauth('/api/requests/00000000-0000-0000-0000-000000000000');
  assert.equal(res.status, 401);
});

test('deleting a team without an admin session is rejected', async () => {
  const res = await api.delUnauth('/api/teams/00000000-0000-0000-0000-000000000000');
  assert.equal(res.status, 401);
});

test('registering a team without an admin session is rejected (no participant self-registration)', async () => {
  const res = await api.post('/api/teams/register', {
    teamName: 'Uninvited Team',
    leaderName: 'Nobody',
    registrationNumber: 'REG-NOPE'
  });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Component management
// ---------------------------------------------------------------------------

let unlimitedComponentId;

test('creating a component via PUT (no id) inserts a new row', async () => {
  const res = await api.put('/api/components', { name: 'Breadboard', category: 'Modules', totalQuantity: 30 });
  assert.equal(res.status, 200);
  const comp = await res.json();
  assert.equal(comp.name, 'Breadboard');
  assert.equal(comp.totalQuantity, 30);
  assert.equal(comp.reservedQuantity, 0);
  assert.equal(comp.hasQuantityLimit, true);
});

test('creating an unlimited component (hasQuantityLimit=false)', async () => {
  const res = await api.put('/api/components', { name: 'Jumper Wires', category: 'Passives', totalQuantity: 0, hasQuantityLimit: false });
  assert.equal(res.status, 200);
  const comp = await res.json();
  assert.equal(comp.hasQuantityLimit, false);
  unlimitedComponentId = comp.id;
});

test('updating a component via PUT (with id) modifies the existing row', async () => {
  const { components } = await getInventory();
  const breadboard = findComponent(components, 'Breadboard');

  const res = await api.put('/api/components', { id: breadboard.id, name: 'Breadboard', category: 'Modules', totalQuantity: 45 });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.id, breadboard.id);
  assert.equal(updated.totalQuantity, 45);
});

// ---------------------------------------------------------------------------
// Component deletion
// ---------------------------------------------------------------------------

test('deleting a component without an admin session is rejected', async () => {
  const { components } = await getInventory();
  const breadboard = findComponent(components, 'Breadboard');
  const res = await api.delUnauth(`/api/components/${breadboard.id}`);
  assert.equal(res.status, 401);
});

test('deleting a component without the authorizing admin\'s name and registration number is rejected', async () => {
  const { components } = await getInventory();
  const breadboard = findComponent(components, 'Breadboard');
  const res = await api.del(`/api/components/${breadboard.id}`, {});
  assert.equal(res.status, 400);

  // Rejected for missing credentials must not have touched the component.
  const { components: stillThere } = await getInventory();
  assert.ok(stillThere.some(c => c.id === breadboard.id));
});

test('deleting a nonexistent component returns 404', async () => {
  const res = await api.del('/api/components/00000000-0000-0000-0000-000000000000', {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 404);
});

test('deleting a component with an invalid id returns 400', async () => {
  const res = await api.del('/api/components/not-a-uuid', {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 400);
});

test('deleting a component strips it from active requests, notifies the team, and records who authorized it', async () => {
  const createRes = await api.put('/api/components', { name: 'Delete Test Widget A', category: 'Modules', totalQuantity: 10 });
  const widget = await createRes.json();

  const reqRes = await api.post('/api/requests', { teamId, cart: [{ componentId: widget.id, quantity: 1 }] });
  const request = await reqRes.json();

  const delRes = await api.del(`/api/components/${widget.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(delRes.status, 200);
  const body = await delRes.json();
  assert.equal(body.notifiedTeams.length, 1);
  assert.equal(body.notifiedTeams[0].requestId, request.id);
  assert.equal(body.deletedBy.name, 'Aryan');
  assert.equal(body.deletedBy.registrationNumber, 'REG-ADMIN-1');

  const { components, requests } = await getInventory();
  assert.ok(!components.some(c => c.id === widget.id));

  const updatedRequest = requests.find(r => r.id === request.id);
  assert.ok(updatedRequest);
  assert.ok(!updatedRequest.items.some(i => i.componentId === widget.id));
  assert.match(updatedRequest.notes, /"Delete Test Widget A" was removed from inventory by Aryan \(Reg: REG-ADMIN-1\)/);
});

test('deleting a component still collected by a team is blocked, and succeeds after reinstating', async () => {
  const createRes = await api.put('/api/components', { name: 'Delete Test Widget B', category: 'Modules', totalQuantity: 10 });
  const widget = await createRes.json();

  const reqRes = await api.post('/api/requests', { teamId, cart: [{ componentId: widget.id, quantity: 2 }] });
  const request = await reqRes.json();
  await api.patch(`/api/requests/${request.id}`, { status: 'COLLECTED' });

  const delRes = await api.del(`/api/components/${widget.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(delRes.status, 409);
  const body = await delRes.json();
  assert.equal(body.holders.length, 1);
  assert.equal(body.holders[0].requestId, request.id);
  assert.equal(body.holders[0].quantity, 2);
  assert.equal(body.holders[0].teamName, 'Circuit Breakers');

  // Blocked deletion must not have touched the component.
  const { components: stillThere } = await getInventory();
  assert.ok(stillThere.some(c => c.id === widget.id));

  await api.patch(`/api/requests/${request.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' }
  });

  const secondDelRes = await api.del(`/api/components/${widget.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(secondDelRes.status, 200);
});

// ---------------------------------------------------------------------------
// Request submission & stock reservation
// ---------------------------------------------------------------------------

let pendingRequestId;

test('submitting a request reserves stock for limited components', async () => {
  const res = await api.post('/api/requests', {
    teamId,
    cart: [{ componentId: arduinoId, quantity: 3 }]
  });
  assert.equal(res.status, 200);
  const request = await res.json();
  assert.equal(request.status, 'PENDING_APPROVAL');
  assert.equal(request.items.length, 1);
  pendingRequestId = request.id;

  const { components } = await getInventory();
  const arduino = findComponent(components, 'Arduino Uno');
  assert.equal(arduino.reservedQuantity, 3);
  assert.equal(arduino.totalQuantity, 20); // unaffected until collected
});

test('submitting a request with a negative quantity is rejected and reserves nothing', async () => {
  const res = await api.post('/api/requests', {
    teamId,
    cart: [{ componentId: arduinoId, quantity: -5 }]
  });
  assert.equal(res.status, 400);

  const { components } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 3); // unchanged
});

test('submitting a request with a zero or non-integer quantity is rejected', async () => {
  const zeroRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 0 }] });
  assert.equal(zeroRes.status, 400);

  const fractionalRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 1.5 }] });
  assert.equal(fractionalRes.status, 400);
});

test('submitting a request with a malformed componentId is rejected', async () => {
  const res = await api.post('/api/requests', { teamId, cart: [{ componentId: 'not-a-uuid', quantity: 1 }] });
  assert.equal(res.status, 400);
});

test('submitting a request for a nonexistent component is rejected', async () => {
  const res = await api.post('/api/requests', {
    teamId,
    cart: [{ componentId: '00000000-0000-0000-0000-000000000000', quantity: 1 }]
  });
  assert.equal(res.status, 400);
});

test('submitting a request beyond available stock is rejected and reserves nothing', async () => {
  // 20 total, 3 already reserved by pendingRequestId -> 17 available.
  const res = await api.post('/api/requests', {
    teamId,
    cart: [{ componentId: arduinoId, quantity: 18 }]
  });
  assert.equal(res.status, 409);

  const { components } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 3); // unchanged, not 21
});

test('submitting a request against an unlimited component does not reserve stock', async () => {
  const res = await api.post('/api/requests', {
    teamId,
    cart: [{ componentId: unlimitedComponentId, quantity: 100 }]
  });
  assert.equal(res.status, 200);

  const { components } = await getInventory();
  const jumperWires = components.find(c => c.id === unlimitedComponentId);
  assert.equal(jumperWires.reservedQuantity, 0);
});

test('inventory reflects the pending request with populated team and component', async () => {
  const { requests } = await getInventory();
  const req = requests.find(r => r.id === pendingRequestId);
  assert.ok(req);
  assert.equal(req.team.teamName, 'Circuit Breakers');
  assert.equal(req.items[0].component.name, 'Arduino Uno');
});

// ---------------------------------------------------------------------------
// Admin request lifecycle: approve -> collect -> reinstate
// ---------------------------------------------------------------------------

test('approving a request keeps stock reserved (no change)', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}`, { status: 'APPROVED_READY' });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, 'APPROVED_READY');

  const { components } = await getInventory();
  const arduino = findComponent(components, 'Arduino Uno');
  assert.equal(arduino.reservedQuantity, 3);
});

test('marking a request COLLECTED moves stock from reserved to deducted total', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}`, { status: 'COLLECTED' });
  assert.equal(res.status, 200);

  const { components } = await getInventory();
  const arduino = findComponent(components, 'Arduino Uno');
  assert.equal(arduino.reservedQuantity, 0);
  assert.equal(arduino.totalQuantity, 17); // 20 - 3
});

test('reinstating without the returner\'s name and registration number is rejected', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}/reinstate`, {});
  assert.equal(res.status, 400);
});

test('reinstating a COLLECTED request restores total stock and records who returned it', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' }
  });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, 'RETURNED_TO_INVENTORY');
  assert.match(updated.notes, /Returned by Aryan \(Reg: REG-100\)/);

  const { components } = await getInventory();
  const arduino = findComponent(components, 'Arduino Uno');
  assert.equal(arduino.totalQuantity, 20);
});

test('reinstating a request that is not COLLECTED is rejected', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' }
  });
  assert.equal(res.status, 400);
});

test('partially reinstating a request keeps it Collected until everything is returned', async () => {
  const submitRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 5 }] });
  const submitted = await submitRes.json();
  await api.patch(`/api/requests/${submitted.id}`, { status: 'COLLECTED' });

  const { components: beforeReturn } = await getInventory();
  const totalBefore = findComponent(beforeReturn, 'Arduino Uno').totalQuantity;

  // Return 2 of the 5 borrowed.
  const partialRes = await api.patch(`/api/requests/${submitted.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' },
    items: [{ componentId: arduinoId, quantity: 2 }]
  });
  assert.equal(partialRes.status, 200);
  const partial = await partialRes.json();
  assert.equal(partial.status, 'COLLECTED'); // still holding the rest — button stays available
  assert.equal(partial.items[0].quantity, 5);
  assert.equal(partial.items[0].returnedQuantity, 2);

  const { components: afterPartial } = await getInventory();
  assert.equal(findComponent(afterPartial, 'Arduino Uno').totalQuantity, totalBefore + 2);

  // Return the remaining 3 — should now flip to fully returned.
  const finalRes = await api.patch(`/api/requests/${submitted.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' },
    items: [{ componentId: arduinoId, quantity: 3 }]
  });
  assert.equal(finalRes.status, 200);
  const final = await finalRes.json();
  assert.equal(final.status, 'RETURNED_TO_INVENTORY');
  assert.equal(final.items[0].returnedQuantity, 5);

  const { components: afterFull } = await getInventory();
  assert.equal(findComponent(afterFull, 'Arduino Uno').totalQuantity, totalBefore + 5);

  // Once fully returned, "reinstate" is no longer a valid action on it.
  const overReturnRes = await api.patch(`/api/requests/${submitted.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' }
  });
  assert.equal(overReturnRes.status, 400);
});

test('reinstating more than the outstanding quantity is rejected', async () => {
  const submitRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 4 }] });
  const submitted = await submitRes.json();
  await api.patch(`/api/requests/${submitted.id}`, { status: 'COLLECTED' });

  const res = await api.patch(`/api/requests/${submitted.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' },
    items: [{ componentId: arduinoId, quantity: 10 }]
  });
  assert.equal(res.status, 400);

  // Clean up so this leftover collected request doesn't skew later reservedQuantity/totalQuantity assertions.
  await api.patch(`/api/requests/${submitted.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' }
  });
});

test('a partially returned request still blocks team/component deletion, reporting only the outstanding amount', async () => {
  const teamRes = await api.postAdmin('/api/teams/register', {
    teamName: 'Partial Return Team', leaderName: 'Partial Leader', registrationNumber: 'REG-PARTIAL-1'
  });
  const team = await teamRes.json();

  const compRes = await api.put('/api/components', { name: 'Partial Return Widget', category: 'Modules', totalQuantity: 10 });
  const widget = await compRes.json();

  const reqRes = await api.post('/api/requests', { teamId: team.id, cart: [{ componentId: widget.id, quantity: 5 }] });
  const request = await reqRes.json();
  await api.patch(`/api/requests/${request.id}`, { status: 'COLLECTED' });

  // Return 2 of 5, leaving 3 outstanding.
  await api.patch(`/api/requests/${request.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' },
    items: [{ componentId: widget.id, quantity: 2 }]
  });

  const teamDelRes = await api.del(`/api/teams/${team.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(teamDelRes.status, 409);
  const teamDelBody = await teamDelRes.json();
  assert.equal(teamDelBody.requests[0].items[0].quantity, 3); // outstanding only, not the original 5

  const compDelRes = await api.del(`/api/components/${widget.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(compDelRes.status, 409);
  const compDelBody = await compDelRes.json();
  assert.equal(compDelBody.holders[0].quantity, 3);

  // Return the rest — both deletions should now succeed.
  await api.patch(`/api/requests/${request.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' }
  });
  const teamDelRes2 = await api.del(`/api/teams/${team.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(teamDelRes2.status, 200);
});

test('deleting a partially-returned collected request restores only the still-outstanding stock', async () => {
  const compRes = await api.put('/api/components', { name: 'Delete Partial Widget', category: 'Modules', totalQuantity: 10 });
  const widget = await compRes.json();

  const reqRes = await api.post('/api/requests', { teamId, cart: [{ componentId: widget.id, quantity: 5 }] });
  const request = await reqRes.json();
  await api.patch(`/api/requests/${request.id}`, { status: 'COLLECTED' });
  // total_quantity: 10 -> 5 (5 collected)

  await api.patch(`/api/requests/${request.id}/reinstate`, {
    returnedBy: { name: 'Aryan', registrationNumber: 'REG-100' },
    items: [{ componentId: widget.id, quantity: 2 }]
  });
  // total_quantity: 5 -> 7 (2 returned), 3 still outstanding

  const { components: beforeDelete } = await getInventory();
  assert.equal(findComponent(beforeDelete, 'Delete Partial Widget').totalQuantity, 7);

  const delRes = await api.del(`/api/requests/${request.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(delRes.status, 200);

  const { components: afterDelete } = await getInventory();
  // Restoring only the outstanding 3 lands back at 10 — double-counting the
  // already-returned 2 would incorrectly land at 12.
  assert.equal(findComponent(afterDelete, 'Delete Partial Widget').totalQuantity, 10);
});

// ---------------------------------------------------------------------------
// Rejecting and deleting requests releases reservations
// ---------------------------------------------------------------------------

let rejectRequestId;

test('rejecting a pending request releases its reservation', async () => {
  const submitRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 5 }] });
  const submitted = await submitRes.json();
  rejectRequestId = submitted.id;

  let { components } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 5);

  const res = await api.patch(`/api/requests/${rejectRequestId}`, { status: 'REJECTED' });
  assert.equal(res.status, 200);

  ({ components } = await getInventory());
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 0);
});

test('deleting a request without the authorizing admin\'s name and registration number is rejected', async () => {
  const submitRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 1 }] });
  const submitted = await submitRes.json();

  const res = await api.del(`/api/requests/${submitted.id}`, {});
  assert.equal(res.status, 400);

  const { requests } = await getInventory();
  assert.ok(requests.some(r => r.id === submitted.id));

  // Clean up properly (with valid credentials) so later tests' exact-value
  // reservedQuantity assertions aren't thrown off by this leftover reservation.
  await api.del(`/api/requests/${submitted.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
});

test('deleting a request restores stock based on its status', async () => {
  const submitRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 2 }] });
  const submitted = await submitRes.json();

  const res = await api.del(`/api/requests/${submitted.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 200);

  const { components, requests } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 0);
  assert.ok(!requests.some(r => r.id === submitted.id));
});

// ---------------------------------------------------------------------------
// Team deletion cascades and restores stock
// ---------------------------------------------------------------------------

test('deleting a team removes it, its requests, and restores reserved stock', async () => {
  const regRes = await api.postAdmin('/api/teams/register', {
    teamName: 'Temp Team',
    leaderName: 'Temp Leader',
    registrationNumber: 'REG-999'
  });
  const tempTeam = await regRes.json();

  const reqRes = await api.post('/api/requests', { teamId: tempTeam.id, cart: [{ componentId: arduinoId, quantity: 4 }] });
  const tempRequest = await reqRes.json();

  let { components } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 4);

  const delRes = await api.del(`/api/teams/${tempTeam.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(delRes.status, 200);

  const { components: comps2, teams, requests } = await getInventory();
  assert.equal(findComponent(comps2, 'Arduino Uno').reservedQuantity, 0);
  assert.ok(!teams.some(t => t.id === tempTeam.id));
  assert.ok(!requests.some(r => r.id === tempRequest.id));
});

test('deleting a team without the authorizing admin\'s name and registration number is rejected', async () => {
  const regRes = await api.postAdmin('/api/teams/register', {
    teamName: 'No Credentials Team',
    leaderName: 'Some Leader',
    registrationNumber: 'REG-NOCRED-1'
  });
  const team = await regRes.json();

  const res = await api.del(`/api/teams/${team.id}`, {});
  assert.equal(res.status, 400);

  const { teams } = await getInventory();
  assert.ok(teams.some(t => t.id === team.id));

  // Clean up.
  await api.del(`/api/teams/${team.id}`, { deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' } });
});

test('deleting a nonexistent team returns 404', async () => {
  const res = await api.del('/api/teams/00000000-0000-0000-0000-000000000000', {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 404);
});

test('deleting a team with collected-but-unreturned components is blocked', async () => {
  const regRes = await api.postAdmin('/api/teams/register', {
    teamName: 'Hoarder Team',
    leaderName: 'Hoarder Leader',
    registrationNumber: 'REG-HOARD-1'
  });
  const team = await regRes.json();

  const reqRes = await api.post('/api/requests', { teamId: team.id, cart: [{ componentId: arduinoId, quantity: 2 }] });
  const request = await reqRes.json();

  const collectRes = await api.patch(`/api/requests/${request.id}`, { status: 'COLLECTED' });
  assert.equal(collectRes.status, 200);

  const { components: beforeAttempt } = await getInventory();
  const totalBeforeAttempt = findComponent(beforeAttempt, 'Arduino Uno').totalQuantity;

  const delRes = await api.del(`/api/teams/${team.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(delRes.status, 409);
  const body = await delRes.json();
  assert.equal(body.requests.length, 1);
  assert.equal(body.requests[0].requestId, request.id);
  assert.equal(body.requests[0].items[0].name, 'Arduino Uno');
  assert.equal(body.requests[0].items[0].quantity, 2);

  // Blocked deletion must not have touched the team, the request, or stock.
  const { teams, requests, components } = await getInventory();
  assert.ok(teams.some(t => t.id === team.id));
  assert.ok(requests.some(r => r.id === request.id));
  assert.equal(findComponent(components, 'Arduino Uno').totalQuantity, totalBeforeAttempt);

  // After reinstating (returning the components), deletion succeeds normally.
  const reinstateRes = await api.patch(`/api/requests/${request.id}/reinstate`, {
    returnedBy: { name: 'Hoarder Leader', registrationNumber: 'REG-HOARD-1' }
  });
  assert.equal(reinstateRes.status, 200);

  const secondDelRes = await api.del(`/api/teams/${team.id}`, {
    deletedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(secondDelRes.status, 200);
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

test('retrieving the audit log without an admin session is rejected', async () => {
  const res = await fetch(`${BASE_URL}/api/audit-log`);
  assert.equal(res.status, 401);
});

test('audit log records reinstate, delete-component, and delete-request actions with the actor identity', async () => {
  const res = await api.getAdmin('/api/audit-log?limit=500');
  assert.equal(res.status, 200);
  const entries = await res.json();
  assert.ok(Array.isArray(entries));

  const reinstateEntry = entries.find(e => e.action === 'REINSTATE_REQUEST' && e.actorRegistrationNumber === 'REG-100');
  assert.ok(reinstateEntry, 'expected a REINSTATE_REQUEST entry for REG-100');
  assert.equal(reinstateEntry.actorName, 'Aryan');
  assert.equal(reinstateEntry.targetType, 'request');

  // Multiple DELETE_COMPONENT entries share REG-ADMIN-1 (Widget A and Widget B),
  // so match on the component name specifically rather than relying on find()
  // picking a particular one among several equally-valid matches.
  const deleteComponentEntry = entries.find(e => e.action === 'DELETE_COMPONENT' && e.details?.componentName === 'Delete Test Widget A');
  assert.ok(deleteComponentEntry, 'expected a DELETE_COMPONENT entry for Delete Test Widget A');
  assert.equal(deleteComponentEntry.actorRegistrationNumber, 'REG-ADMIN-1');
  assert.equal(deleteComponentEntry.targetType, 'component');

  const deleteRequestEntry = entries.find(e => e.action === 'DELETE_REQUEST' && e.actorRegistrationNumber === 'REG-ADMIN-1');
  assert.ok(deleteRequestEntry, 'expected a DELETE_REQUEST entry for REG-ADMIN-1');
  assert.equal(deleteRequestEntry.targetType, 'request');

  const deleteTeamEntry = entries.find(e => e.action === 'DELETE_TEAM' && e.actorRegistrationNumber === 'REG-ADMIN-1');
  assert.ok(deleteTeamEntry, 'expected a DELETE_TEAM entry for REG-ADMIN-1');
  assert.equal(deleteTeamEntry.targetType, 'team');
  assert.ok(deleteTeamEntry.details?.teamName);
});

// ---------------------------------------------------------------------------
// Team roster (min 3 / max 4 total participants including the leader; open to
// the team itself until finalized, admin-only + audit-logged after that)
// ---------------------------------------------------------------------------

test('team leader can add members (with a registration number) to their own roster while unlocked', async () => {
  const res = await api.post(`/api/teams/${teamId}/members`, { name: 'Member One', registrationNumber: 'REG-MEM-1' });
  assert.equal(res.status, 201);
  const member = await res.json();
  assert.equal(member.name, 'Member One');
  assert.equal(member.registrationNumber, 'REG-MEM-1');
  assert.equal(typeof member.id, 'string');

  const { teams } = await getInventory();
  const team = teams.find(t => t.id === teamId);
  assert.equal(team.members.length, 1);
  assert.equal(team.rosterLocked, false);
});

test('adding a member with a blank name is rejected', async () => {
  const res = await api.post(`/api/teams/${teamId}/members`, { name: '   ', registrationNumber: 'REG-MEM-X' });
  assert.equal(res.status, 400);
});

test('adding a member with a blank registration number is rejected', async () => {
  const res = await api.post(`/api/teams/${teamId}/members`, { name: 'No Reg Number', registrationNumber: '   ' });
  assert.equal(res.status, 400);
});

test('adding a member with a registration number already used by another member is rejected', async () => {
  const res = await api.post(`/api/teams/${teamId}/members`, { name: 'Duplicate Reg', registrationNumber: 'reg-mem-1' });
  assert.equal(res.status, 409);

  const { teams } = await getInventory();
  assert.equal(teams.find(t => t.id === teamId).members.length, 1);
});

test('finalizing a roster below the minimum of 3 total participants is rejected', async () => {
  // teamId currently has 1 leader + 1 member = 2 total, below MIN_TEAM_SIZE.
  const res = await api.post(`/api/teams/${teamId}/lock`, {});
  assert.equal(res.status, 400);

  const { teams } = await getInventory();
  assert.equal(teams.find(t => t.id === teamId).rosterLocked, false);
});

test('adding members up to the maximum of 4 total participants, then rejecting a 5th', async () => {
  const res2 = await api.post(`/api/teams/${teamId}/members`, { name: 'Member Two', registrationNumber: 'REG-MEM-2' });
  assert.equal(res2.status, 201);
  const res3 = await api.post(`/api/teams/${teamId}/members`, { name: 'Member Three', registrationNumber: 'REG-MEM-3' });
  assert.equal(res3.status, 201);

  const { teams } = await getInventory();
  assert.equal(teams.find(t => t.id === teamId).members.length, 3);

  // 1 leader + 3 members = 4, already at MAX_TEAM_SIZE — a 5th participant is rejected.
  const res4 = await api.post(`/api/teams/${teamId}/members`, { name: 'Member Four', registrationNumber: 'REG-MEM-4' });
  assert.equal(res4.status, 400);
});

test('a team leader can remove a member while unlocked', async () => {
  const { teams } = await getInventory();
  const toRemove = teams.find(t => t.id === teamId).members.find(m => m.name === 'Member Three');

  const res = await api.delUnauth(`/api/teams/${teamId}/members/${toRemove.id}`);
  assert.equal(res.status, 200);

  const { teams: after } = await getInventory();
  assert.equal(after.find(t => t.id === teamId).members.length, 2);
});

test('finalizing succeeds once the roster is within 3-4 total participants', async () => {
  const res = await api.post(`/api/teams/${teamId}/lock`, {});
  assert.equal(res.status, 200);
  const team = await res.json();
  assert.equal(team.rosterLocked, true);
  assert.equal(team.members.length, 2);
});

test('finalizing an already-locked roster is rejected', async () => {
  const res = await api.post(`/api/teams/${teamId}/lock`, {});
  assert.equal(res.status, 400);
});

test('once locked, adding a member without an admin session is rejected', async () => {
  const res = await api.post(`/api/teams/${teamId}/members`, { name: 'Sneaky Member', registrationNumber: 'REG-SNEAKY' });
  assert.equal(res.status, 403);

  const { teams } = await getInventory();
  assert.equal(teams.find(t => t.id === teamId).members.length, 2);
});

test('once locked, removing a member without an admin session is rejected', async () => {
  const { teams } = await getInventory();
  const target = teams.find(t => t.id === teamId).members[0];

  const res = await api.delUnauth(`/api/teams/${teamId}/members/${target.id}`);
  assert.equal(res.status, 403);
});

test('an admin adding a member to a locked roster without authorizing credentials is rejected', async () => {
  const res = await api.postAdmin(`/api/teams/${teamId}/members`, { name: 'Admin Added', registrationNumber: 'REG-ADMIN-ADDED' });
  assert.equal(res.status, 400);
});

test('an admin can add a member to a locked roster with authorizing credentials, and it is audit-logged', async () => {
  const res = await api.postAdmin(`/api/teams/${teamId}/members`, {
    name: 'Admin Added',
    registrationNumber: 'REG-ADMIN-ADDED',
    changedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 201);
  const member = await res.json();
  assert.equal(member.name, 'Admin Added');
  assert.equal(member.registrationNumber, 'REG-ADMIN-ADDED');

  const { teams } = await getInventory();
  assert.equal(teams.find(t => t.id === teamId).members.length, 3);
});

test('an admin can remove a member from a locked roster with authorizing credentials, and it is audit-logged', async () => {
  const { teams } = await getInventory();
  const target = teams.find(t => t.id === teamId).members.find(m => m.name === 'Admin Added');

  const res = await api.del(`/api/teams/${teamId}/members/${target.id}`, {
    changedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 200);

  const { teams: after } = await getInventory();
  assert.equal(after.find(t => t.id === teamId).members.length, 2);
});

test('audit log records ADD_TEAM_MEMBER and REMOVE_TEAM_MEMBER for the locked-roster admin changes', async () => {
  const res = await api.getAdmin('/api/audit-log?limit=500');
  assert.equal(res.status, 200);
  const entries = await res.json();

  const addEntry = entries.find(e => e.action === 'ADD_TEAM_MEMBER' && e.details?.memberName === 'Admin Added');
  assert.ok(addEntry, 'expected an ADD_TEAM_MEMBER entry for "Admin Added"');
  assert.equal(addEntry.actorRegistrationNumber, 'REG-ADMIN-1');
  assert.equal(addEntry.targetType, 'team');
  assert.equal(addEntry.details?.memberRegistrationNumber, 'REG-ADMIN-ADDED');

  const removeEntry = entries.find(e => e.action === 'REMOVE_TEAM_MEMBER' && e.details?.memberName === 'Admin Added');
  assert.ok(removeEntry, 'expected a REMOVE_TEAM_MEMBER entry for "Admin Added"');
  assert.equal(removeEntry.actorRegistrationNumber, 'REG-ADMIN-1');
  assert.equal(removeEntry.details?.memberRegistrationNumber, 'REG-ADMIN-ADDED');
});

test('adding a member to a nonexistent team returns 404', async () => {
  const res = await api.post('/api/teams/00000000-0000-0000-0000-000000000000/members', { name: 'Ghost Member', registrationNumber: 'REG-GHOST' });
  assert.equal(res.status, 404);
});

test('locking a nonexistent team returns 404', async () => {
  const res = await api.post('/api/teams/00000000-0000-0000-0000-000000000000/lock', {});
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Admin-only name corrections (leader + member), unlike add/remove — always
// requires an admin session and credentials, regardless of roster lock state.
// ---------------------------------------------------------------------------

test('editing the leader name without an admin session is rejected', async () => {
  const res = await api.patchUnauth(`/api/teams/${teamId}/leader-name`, { leaderName: 'Someone Else' });
  assert.equal(res.status, 401);
});

test('editing the leader name without authorizing credentials is rejected', async () => {
  const res = await api.patch(`/api/teams/${teamId}/leader-name`, { leaderName: 'Someone Else' });
  assert.equal(res.status, 400);
});

test('an admin can edit the team leader name, and it is audit-logged', async () => {
  const res = await api.patch(`/api/teams/${teamId}/leader-name`, {
    leaderName: 'Aryan Renamed',
    changedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 200);
  const team = await res.json();
  assert.equal(team.leaderName, 'Aryan Renamed');

  const { teams } = await getInventory();
  assert.equal(teams.find(t => t.id === teamId).leaderName, 'Aryan Renamed');

  const auditRes = await api.getAdmin('/api/audit-log?limit=500');
  const entries = await auditRes.json();
  const entry = entries.find(e => e.action === 'EDIT_TEAM_LEADER' && e.targetId === teamId);
  assert.ok(entry, 'expected an EDIT_TEAM_LEADER entry for this team');
  assert.equal(entry.actorRegistrationNumber, 'REG-ADMIN-1');
  assert.equal(entry.details?.previousName, 'Aryan');
  assert.equal(entry.details?.newName, 'Aryan Renamed');
});

test('editing a member name without an admin session is rejected', async () => {
  const { teams } = await getInventory();
  const target = teams.find(t => t.id === teamId).members[0];

  const res = await api.patchUnauth(`/api/teams/${teamId}/members/${target.id}`, { name: 'Someone Else' });
  assert.equal(res.status, 401);
});

test('editing a member name without authorizing credentials is rejected', async () => {
  const { teams } = await getInventory();
  const target = teams.find(t => t.id === teamId).members[0];

  const res = await api.patch(`/api/teams/${teamId}/members/${target.id}`, { name: 'Someone Else' });
  assert.equal(res.status, 400);
});

test('an admin can edit a member name, and it is audit-logged', async () => {
  const { teams } = await getInventory();
  const target = teams.find(t => t.id === teamId).members.find(m => m.name === 'Member One');

  const res = await api.patch(`/api/teams/${teamId}/members/${target.id}`, {
    name: 'Member One Renamed',
    changedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 200);
  const member = await res.json();
  assert.equal(member.name, 'Member One Renamed');
  assert.equal(member.registrationNumber, 'REG-MEM-1');

  const { teams: after } = await getInventory();
  assert.ok(after.find(t => t.id === teamId).members.some(m => m.name === 'Member One Renamed'));

  const auditRes = await api.getAdmin('/api/audit-log?limit=500');
  const entries = await auditRes.json();
  const entry = entries.find(e => e.action === 'EDIT_TEAM_MEMBER' && e.details?.newName === 'Member One Renamed');
  assert.ok(entry, 'expected an EDIT_TEAM_MEMBER entry for the rename');
  assert.equal(entry.actorRegistrationNumber, 'REG-ADMIN-1');
  assert.equal(entry.details?.previousName, 'Member One');
});

test('editing a nonexistent member returns 404', async () => {
  const res = await api.patch(`/api/teams/${teamId}/members/00000000-0000-0000-0000-000000000000`, {
    name: 'Ghost Rename',
    changedBy: { name: 'Aryan', registrationNumber: 'REG-ADMIN-1' }
  });
  assert.equal(res.status, 404);
});
