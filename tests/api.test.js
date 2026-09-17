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
const TEST_DB_NAME = 'electrohack_test';
const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const TEST_ADMIN_SECRET = 'test-admin-secret-123';

let serverProcess;
let serverLogs = '';

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
});

after(async () => {
  if (serverProcess) serverProcess.kill();
  await resetTestDatabase();
});

// --- helpers ---
const api = {
  get: (p) => fetch(`${BASE_URL}${p}`),
  post: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  put: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patch: (p, body) => fetch(`${BASE_URL}${p}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }),
  del: (p) => fetch(`${BASE_URL}${p}`, { method: 'DELETE' })
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
  const res = await api.post('/api/teams/register', {
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

test('registering with a duplicate team name (case-insensitive) is rejected', async () => {
  const res = await api.post('/api/teams/register', {
    teamName: 'circuit breakers',
    leaderName: 'Someone Else',
    registrationNumber: 'REG-101'
  });
  assert.equal(res.status, 409);
});

test('registering with a duplicate registration number is rejected', async () => {
  const res = await api.post('/api/teams/register', {
    teamName: 'Another Team',
    leaderName: 'Someone Else',
    registrationNumber: 'reg-100'
  });
  assert.equal(res.status, 409);
});

test('registering with missing fields is rejected', async () => {
  const res = await api.post('/api/teams/register', { teamName: 'Incomplete Team' });
  assert.equal(res.status, 400);
});

test('logging in with correct credentials succeeds and omits the password', async () => {
  const res = await api.post('/api/teams/login', { teamName: 'Circuit Breakers', password: registeredPassword });
  assert.equal(res.status, 200);
  const team = await res.json();
  assert.equal(team.id, teamId);
  assert.equal(team.password, undefined);
});

test('logging in with the wrong password is rejected', async () => {
  const res = await api.post('/api/teams/login', { teamName: 'Circuit Breakers', password: 'wrong-password' });
  assert.equal(res.status, 401);
});

test('logging in as a nonexistent team is rejected', async () => {
  const res = await api.post('/api/teams/login', { teamName: 'Ghost Team', password: 'whatever' });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// Admin login (secret lives server-side in ADMIN_SECRET, never sent to the client)
// ---------------------------------------------------------------------------

test('admin login with the correct secret succeeds', async () => {
  const res = await api.post('/api/admin/login', { password: TEST_ADMIN_SECRET });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('admin login with an incorrect secret is rejected', async () => {
  const res = await api.post('/api/admin/login', { password: 'not-the-secret' });
  assert.equal(res.status, 401);
});

test('admin login with a missing password is rejected', async () => {
  const res = await api.post('/api/admin/login', {});
  assert.equal(res.status, 400);
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

test('reinstating a COLLECTED request restores total stock', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}/reinstate`);
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.status, 'RETURNED_TO_INVENTORY');

  const { components } = await getInventory();
  const arduino = findComponent(components, 'Arduino Uno');
  assert.equal(arduino.totalQuantity, 20);
});

test('reinstating a request that is not COLLECTED is rejected', async () => {
  const res = await api.patch(`/api/requests/${pendingRequestId}/reinstate`);
  assert.equal(res.status, 400);
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

test('deleting a request restores stock based on its status', async () => {
  const submitRes = await api.post('/api/requests', { teamId, cart: [{ componentId: arduinoId, quantity: 2 }] });
  const submitted = await submitRes.json();

  const res = await api.del(`/api/requests/${submitted.id}`);
  assert.equal(res.status, 200);

  const { components, requests } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 0);
  assert.ok(!requests.some(r => r.id === submitted.id));
});

// ---------------------------------------------------------------------------
// Team deletion cascades and restores stock
// ---------------------------------------------------------------------------

test('deleting a team removes it, its requests, and restores reserved stock', async () => {
  const regRes = await api.post('/api/teams/register', {
    teamName: 'Temp Team',
    leaderName: 'Temp Leader',
    registrationNumber: 'REG-999'
  });
  const tempTeam = await regRes.json();

  const reqRes = await api.post('/api/requests', { teamId: tempTeam.id, cart: [{ componentId: arduinoId, quantity: 4 }] });
  const tempRequest = await reqRes.json();

  let { components } = await getInventory();
  assert.equal(findComponent(components, 'Arduino Uno').reservedQuantity, 4);

  const delRes = await api.del(`/api/teams/${tempTeam.id}`);
  assert.equal(delRes.status, 200);

  const { components: comps2, teams, requests } = await getInventory();
  assert.equal(findComponent(comps2, 'Arduino Uno').reservedQuantity, 0);
  assert.ok(!teams.some(t => t.id === tempTeam.id));
  assert.ok(!requests.some(r => r.id === tempRequest.id));
});

test('deleting a nonexistent team returns 404', async () => {
  const res = await api.del('/api/teams/00000000-0000-0000-0000-000000000000');
  assert.equal(res.status, 404);
});
