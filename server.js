import express from 'express';
import pg from 'pg';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/electrohack';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.warn('ADMIN_SECRET is not set in .env — admin login will be unavailable.');
}

// Constant-time comparison so response timing can't be used to guess the secret.
// Hashing first means both sides are always compared at a fixed length, so
// a length mismatch on the raw input can't produce an early, faster return.
const secretsMatch = (a, b) => {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

// Escapes LIKE/ILIKE metacharacters so user input is matched literally
// (Postgres' default LIKE escape character is backslash).
const escapeLikePattern = (s) => s.replace(/[\\%_]/g, '\\$&');

// Team passwords are stored encrypted (AES-256-GCM), not plaintext, and not hashed
// either — the admin "Credentials" panel needs to show the real value back, which
// a one-way hash can never do. Encryption key is derived (scrypt) from a dedicated
// secret if set, else from ADMIN_SECRET so no extra .env setup is required.
//
// IMPORTANT: whichever secret this key is derived from must stay stable. Rotating
// it (or ADMIN_SECRET, if that's the fallback in use) makes every already-encrypted
// team password permanently undecryptable — set TEAM_PASSWORD_ENC_SECRET explicitly
// and keep it separate from ADMIN_SECRET if you expect to rotate the admin passkey.
const TEAM_PASSWORD_ENC_SECRET = process.env.TEAM_PASSWORD_ENC_SECRET || ADMIN_SECRET;
if (!process.env.TEAM_PASSWORD_ENC_SECRET && ADMIN_SECRET) {
  console.warn('TEAM_PASSWORD_ENC_SECRET is not set — deriving the team-password encryption key from ADMIN_SECRET instead. Rotating ADMIN_SECRET will make existing team passwords undecryptable; set TEAM_PASSWORD_ENC_SECRET to avoid that.');
}
const TEAM_PASSWORD_ENC_PREFIX = 'enc1:';
const teamPasswordKey = TEAM_PASSWORD_ENC_SECRET
  ? crypto.scryptSync(TEAM_PASSWORD_ENC_SECRET, 'electrohack-team-password-v1', 32)
  : null;

const encryptTeamPassword = (plain) => {
  if (!teamPasswordKey) {
    throw new Error('Cannot store team passwords securely: neither TEAM_PASSWORD_ENC_SECRET nor ADMIN_SECRET is set.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', teamPasswordKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return TEAM_PASSWORD_ENC_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
};

// Rows written before this encryption was added are still plaintext — returned
// as-is so existing teams aren't locked out or need re-registering.
const decryptTeamPassword = (stored) => {
  if (typeof stored !== 'string' || !stored.startsWith(TEAM_PASSWORD_ENC_PREFIX)) {
    return stored;
  }
  if (!teamPasswordKey) {
    throw new Error('Cannot decrypt team password: neither TEAM_PASSWORD_ENC_SECRET nor ADMIN_SECRET is set.');
  }
  const raw = Buffer.from(stored.slice(TEAM_PASSWORD_ENC_PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', teamPasswordKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

// Admin sessions: /api/admin/login exchanges ADMIN_SECRET for an opaque, random
// token instead of the client caching the raw shared secret. The secret itself
// never leaves this exchange, so it can't be read out of sessionStorage/devtools
// after login, and a compromised token is revocable (logout, or the TTL below)
// without rotating ADMIN_SECRET and kicking every other admin out.
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const adminSessions = new Map(); // token -> expiresAt

const issueAdminToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
};

const revokeAdminToken = (token) => {
  if (token) adminSessions.delete(token);
};

const isValidAdminToken = (token) => {
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (expiresAt === undefined) return false;
  if (expiresAt < Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
};

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'MODIFIED_BY_ADMIN', 'APPROVED_READY'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({ connectionString: DATABASE_URL });
let dbConnected = false;
// Only becomes true once the initial initSchema()/seedAndSync() pass completes.
// tryReconnect() checks this so a pool error firing mid-startup can't mark the
// DB ready on a bare connectivity check, before the tables actually exist.
let schemaReady = false;

// After a pool error, dbConnected is cleared; this probes the pool so a
// transient error (e.g. an idle client dropped by the DB) doesn't leave
// checkDbConnection permanently returning 503 once the pool recovers.
const tryReconnect = async () => {
  try {
    await pool.query('SELECT 1');
    if (schemaReady) {
      if (!dbConnected) console.log('PostgreSQL connection restored');
      dbConnected = true;
    }
  } catch {
    dbConnected = false;
  }
};

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
  dbConnected = false;
  tryReconnect();
});

// Retries on failure so a DB that isn't accepting connections yet at startup
// (e.g. a compose/local-dev race) doesn't leave the app stuck at 503 forever —
// a rejected pool.connect() here never emits a pool 'error' event, so
// tryReconnect() alone can't recover from this path.
const RECONNECT_DELAY_MS = 3000;
const connectAndInitSchema = async () => {
  try {
    const client = await pool.connect();
    client.release();
    console.log('Connected to PostgreSQL');
    await initSchema();
    await seedAndSync();
    // Only mark the DB "ready" once the schema exists and seed/sync has run,
    // so requests that arrive right at startup can't hit a missing-table error.
    schemaReady = true;
    dbConnected = true;
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    console.log(`TIP: Check your DATABASE_URL and that PostgreSQL is running. Retrying in ${RECONNECT_DELAY_MS / 1000}s...`);
    setTimeout(connectAndInitSchema, RECONNECT_DELAY_MS);
  }
};

console.log('🔗 Attempting to connect to PostgreSQL...');
connectAndInitSchema();

// Middleware to check DB connection status before handling requests
const checkDbConnection = (req, res, next) => {
  if (!dbConnected) {
    return res.status(503).json({ error: 'Database not ready.' });
  }
  next();
};

// Gates admin-only mutations (component/request/team management) behind a session
// token issued by /api/admin/login. Without this, any client that knows a
// request/team/component id could call these routes directly with no credentials
// at all — the admin login screen was previously a UI-only gate.
const requireAdmin = (req, res, next) => {
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin actions are not configured on the server.' });
  }
  const token = req.headers['x-admin-token'];
  if (!isValidAdminToken(token)) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  next();
};

// --- SCHEMA ---
const initSchema = async () => {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS components (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      reserved_quantity INTEGER NOT NULL DEFAULT 0,
      has_quantity_limit BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_name TEXT NOT NULL UNIQUE,
      leader_name TEXT NOT NULL,
      registration_number TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      roster_locked BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  // Migration for databases created before team rosters existed.
  await pool.query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS roster_locked BOOLEAN NOT NULL DEFAULT FALSE`);

  // Additional participants beyond the leader (who is captured on `teams` itself).
  // Team size rule (leader + members) is 3-4 total, enforced in the route handlers
  // rather than a CHECK constraint, since it depends on counting sibling rows.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      added_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Migration for team_members created before registration numbers were captured.
  await pool.query(`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS registration_number TEXT NOT NULL DEFAULT ''`);
  // Case-insensitive, system-wide uniqueness — a registration number identifies one
  // person, so the same one shouldn't be addable as a member twice. The `<> ''`
  // filter exempts legacy rows backfilled with the empty-string default above.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS team_members_registration_number_unique
    ON team_members (lower(registration_number)) WHERE registration_number <> ''
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
      notes TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      component_id UUID REFERENCES components(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL,
      returned_quantity INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Migration for databases created before partial returns existed.
  await pool.query(`ALTER TABLE request_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0`);

  // Migration for databases created before component deletion existed: the FK
  // above needs ON DELETE SET NULL so a deleted component's historical
  // request_items rows survive as orphaned references (the API already maps
  // those to `component: null`, and the UI already renders that case) instead
  // of blocking the delete with a foreign-key violation. Idempotent — cheap to
  // run on every startup, a no-op once the constraint already matches.
  await pool.query(`
    ALTER TABLE request_items DROP CONSTRAINT IF EXISTS request_items_component_id_fkey;
    ALTER TABLE request_items ADD CONSTRAINT request_items_component_id_fkey
      FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE SET NULL;
  `);

  // Durable audit trail for admin actions that require the acting person to
  // identify themselves (reinstate, delete component, delete request history).
  // No FK on target_id: the target can be a request, a component, or a team,
  // and for deletions the target row is gone by the time this is read back —
  // that's the point of an audit log surviving what it's auditing.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_registration_number TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id UUID,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

// Inserted in the same transaction as the action it records, so the audit
// entry and the action it describes commit or roll back together.
const recordAuditLog = async (client, { action, actorName, actorRegistrationNumber, targetType, targetId, details }) => {
  await client.query(
    `INSERT INTO audit_log (action, actor_name, actor_registration_number, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [action, actorName, actorRegistrationNumber, targetType, targetId ?? null, details ? JSON.stringify(details) : null]
  );
};

// --- MAPPERS ---
const mapComponent = (c) => ({
  id: c.id,
  name: c.name,
  category: c.category,
  totalQuantity: c.total_quantity,
  reservedQuantity: c.reserved_quantity || 0,
  hasQuantityLimit: c.has_quantity_limit !== false
});

const mapTeamMember = (m) => ({ id: m.id, name: m.name, registrationNumber: m.registration_number, addedAt: m.added_at });

// `members` defaults to [] so call sites that already know there can't be any
// yet (e.g. a just-inserted registration row) don't need an extra query.
const mapTeam = (t, members = []) => ({
  id: t.id,
  teamName: t.team_name,
  leaderName: t.leader_name,
  registrationNumber: t.registration_number,
  members: members.map(mapTeamMember),
  rosterLocked: t.roster_locked === true
});

// Team size rule: leader (always 1) + team_members must total 3-4.
const MIN_TEAM_SIZE = 3;
const MAX_TEAM_SIZE = 4;

const isValidUUID = (v) => typeof v === 'string' && UUID_RE.test(v);

// --- HELPER: BATCH STOCK ADJUSTMENT ---
// Adjusts `column` (reserved_quantity or total_quantity) for every item's component by
// (sign * quantity) in a single batched UPDATE, skipping unlimited components. Replaces
// the several near-identical per-item update loops that used to be spread across the
// request/reinstate/delete/team-delete routes.
const adjustStock = async (client, items, column, sign = 1) => {
  // Aggregate by component first: Postgres' UPDATE ... FROM only applies ONE of several
  // source rows that match the same target row (it does not sum them), so if `items`
  // ever contains the same componentId twice we must pre-sum deltas ourselves.
  const totals = new Map();
  for (const i of items || []) {
    const id = i.componentId ?? i.component_id;
    if (id == null) continue;
    totals.set(id, (totals.get(id) || 0) + sign * i.quantity);
  }
  if (totals.size === 0) return;
  const ids = Array.from(totals.keys());
  const deltas = Array.from(totals.values());
  await client.query(
    `UPDATE components AS c
     SET ${column} = c.${column} + t.delta
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS delta) AS t
     WHERE c.id = t.id AND c.has_quantity_limit = true`,
    [ids, deltas]
  );
};

// --- HELPER: STOCK RECALCULATION ---
// This fixes data drift (like negative reserved quantities) by syncing DB with actual active requests
const recalculateInventory = async () => {
  console.log('Syncing inventory reservation counts...');
  try {
    await pool.query('UPDATE components SET reserved_quantity = 0');

    const { rows } = await pool.query(
      `SELECT component_id, SUM(quantity)::int AS qty
       FROM request_items ri
       JOIN requests r ON r.id = ri.request_id
       WHERE r.status = ANY($1::text[])
       GROUP BY component_id`,
      [ACTIVE_STATUSES]
    );

    const withComponent = rows.filter(row => row.component_id);
    if (withComponent.length > 0) {
      await pool.query(
        `UPDATE components AS c
         SET reserved_quantity = t.qty
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::int[]) AS qty) AS t
         WHERE c.id = t.id`,
        [withComponent.map(row => row.component_id), withComponent.map(row => row.qty)]
      );
    }
    console.log('Inventory reservations synchronized.');
  } catch (err) {
    console.error('Failed to sync inventory:', err.message);
  }
};

// --- API ROUTES ---

// Health check to verify server and DB status
app.get('/api/health', async (req, res) => {
  // Mirror checkDbConnection's gate: a bare SELECT 1 can succeed before the
  // schema/seed pass has finished, which would report healthy while every
  // other route is still returning 503.
  if (!dbConnected) {
    return res.status(503).json({ status: 'ok', database: { connected: false, state: 'disconnected' } });
  }
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: { connected: true, state: 'connected' } });
  } catch (err) {
    res.status(503).json({ status: 'ok', database: { connected: false, state: 'disconnected' } });
  }
});

// Initial seed and Sync
const seedAndSync = async () => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM components');
    if (rows[0].count === 0) {
      const mock = [
        ['Arduino Uno', 'Modules', 20],
        ['ESP32', 'Modules', 15],
        ['DHT11 Sensor', 'Sensors', 50],
        ['Servo Motor SG90', 'Modules', 10]
      ];
      for (const [name, category, totalQuantity] of mock) {
        await pool.query(
          'INSERT INTO components (name, category, total_quantity) VALUES ($1, $2, $3)',
          [name, category, totalQuantity]
        );
      }
      console.log('🌱 Database seeded with initial components');
    }
    await recalculateInventory();
  } catch (err) {
    console.error('Seed/Sync failed:', err.message);
  }
};

// Get full inventory state
app.get('/api/inventory', checkDbConnection, async (req, res) => {
  try {
    const [componentsRes, teamsRes, teamMembersRes, requestsRes] = await Promise.all([
      pool.query('SELECT * FROM components ORDER BY name'),
      pool.query('SELECT * FROM teams ORDER BY team_name'),
      pool.query('SELECT * FROM team_members ORDER BY added_at'),
      pool.query(`
        SELECT r.id, r.team_id, r.status, r.timestamp, r.notes,
               t.id AS team_pk, t.team_name, t.leader_name, t.registration_number,
               ri.component_id, ri.quantity, ri.returned_quantity,
               c.id AS comp_pk, c.name AS comp_name, c.category AS comp_category,
               c.total_quantity AS comp_total, c.reserved_quantity AS comp_reserved,
               c.has_quantity_limit AS comp_limit
        FROM requests r
        LEFT JOIN teams t ON t.id = r.team_id
        LEFT JOIN request_items ri ON ri.request_id = r.id
        LEFT JOIN components c ON c.id = ri.component_id
        ORDER BY r.timestamp DESC
      `)
    ]);

    const requestMap = new Map();
    for (const row of requestsRes.rows) {
      if (!requestMap.has(row.id)) {
        requestMap.set(row.id, {
          id: row.id,
          teamId: row.team_id,
          team: row.team_pk ? {
            id: row.team_pk,
            teamName: row.team_name,
            leaderName: row.leader_name,
            registrationNumber: row.registration_number
          } : null,
          status: row.status,
          timestamp: row.timestamp,
          notes: row.notes,
          items: []
        });
      }
      if (row.component_id !== null) {
        requestMap.get(row.id).items.push({
          componentId: row.component_id,
          quantity: row.quantity,
          returnedQuantity: row.returned_quantity || 0,
          component: row.comp_pk ? {
            id: row.comp_pk,
            name: row.comp_name,
            category: row.comp_category,
            totalQuantity: row.comp_total,
            reservedQuantity: row.comp_reserved || 0,
            hasQuantityLimit: row.comp_limit !== false
          } : null
        });
      }
    }

    const membersByTeam = new Map();
    for (const row of teamMembersRes.rows) {
      if (!membersByTeam.has(row.team_id)) membersByTeam.set(row.team_id, []);
      membersByTeam.get(row.team_id).push(row);
    }

    res.json({
      components: componentsRes.rows.map(mapComponent),
      teams: teamsRes.rows.map(t => mapTeam(t, membersByTeam.get(t.id) || [])),
      requests: Array.from(requestMap.values())
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Team Registration (Admin only — there is no participant self-registration flow)
app.post('/api/teams/register', checkDbConnection, requireAdmin, async (req, res) => {
  const { teamName, leaderName, registrationNumber } = req.body;
  if (!teamName || !leaderName || !registrationNumber) {
    return res.status(400).json({ error: 'All fields are required for registration.' });
  }

  try {
    const existingByName = await pool.query('SELECT id FROM teams WHERE team_name ILIKE $1', [escapeLikePattern(teamName.trim())]);
    if (existingByName.rows.length > 0) {
      return res.status(409).json({ error: 'This team name is already taken.' });
    }

    const existingByReg = await pool.query('SELECT id FROM teams WHERE registration_number ILIKE $1', [escapeLikePattern(registrationNumber.trim())]);
    if (existingByReg.rows.length > 0) {
      return res.status(409).json({ error: 'This registration number is already in use.' });
    }

    // Generate a random password (8 characters, alphanumeric)
    const generatePassword = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // Excluding ambiguous characters
      let password = '';
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const generatedPassword = generatePassword();

    const { rows } = await pool.query(
      'INSERT INTO teams (team_name, leader_name, registration_number, password) VALUES ($1, $2, $3, $4) RETURNING *',
      [teamName.trim(), leaderName.trim(), registrationNumber.trim(), encryptTeamPassword(generatedPassword)]
    );

    // The plaintext password lives only here and in the client's one-time display —
    // the DB row above got the encrypted form. Also retrievable later via
    // GET /api/teams/:id/credentials, which decrypts on the way out.
    res.status(201).json({
      ...mapTeam(rows[0]),
      password: generatedPassword
    });
  } catch (err) {
    if (err.code === '23505') { // Postgres unique_violation
      if (err.constraint && err.constraint.includes('team_name')) {
        return res.status(409).json({ error: 'This team name is already in use.' });
      }
      if (err.constraint && err.constraint.includes('registration_number')) {
        return res.status(409).json({ error: 'This registration number is already in use.' });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// Team Login
app.post('/api/teams/login', checkDbConnection, async (req, res) => {
  const { teamName, password } = req.body;
  if (!teamName || !password) {
    return res.status(400).json({ error: 'Team name and password are required.' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM teams WHERE team_name ILIKE $1', [escapeLikePattern(teamName.trim())]);
    const team = rows[0];
    if (!team) {
      return res.status(404).json({ error: 'Team not found. Please register first.' });
    }

    let storedPassword;
    try {
      storedPassword = decryptTeamPassword(team.password);
    } catch (decryptErr) {
      console.error('Failed to decrypt stored team password:', decryptErr.message);
      return res.status(500).json({ error: 'Unable to verify password. Contact an admin.' });
    }
    if (!secretsMatch(password, storedPassword)) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    const { rows: memberRows } = await pool.query('SELECT * FROM team_members WHERE team_id = $1 ORDER BY added_at', [team.id]);

    // Don't send password back in response
    res.json(mapTeam(team, memberRows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin login is not configured on the server.' });
  }
  if (!secretsMatch(password, ADMIN_SECRET)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  res.json({ ok: true, token: issueAdminToken() });
});

// Admin Logout — revokes the session token so a leaked/old token stops working
// immediately, rather than only expiring after ADMIN_SESSION_TTL_MS.
app.post('/api/admin/logout', (req, res) => {
  revokeAdminToken(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// Submit Request
app.post('/api/requests', checkDbConnection, async (req, res) => {
  const { teamId } = req.body;
  const cart = Array.isArray(req.body.cart) ? req.body.cart : [];

  // Reject malformed items outright — a negative or non-integer quantity would
  // otherwise drive reserved_quantity negative and fabricate stock, since
  // adjustStock just applies whatever delta it's given.
  for (const item of cart) {
    if (!isValidUUID(item.componentId)) {
      return res.status(400).json({ error: 'Cart contains an invalid componentId.' });
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: 'Cart quantities must be positive integers.' });
    }
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    if (cart.length > 0) {
      // Aggregate requested quantity per component (the cart can list the same
      // component more than once) and lock those rows before checking
      // availability, so a concurrent request for the same stock can't race
      // past this check between the SELECT and the reservation below.
      const requested = new Map();
      for (const item of cart) {
        requested.set(item.componentId, (requested.get(item.componentId) || 0) + item.quantity);
      }
      const requestedIds = Array.from(requested.keys());
      const { rows: componentRows } = await client.query(
        'SELECT id, total_quantity, reserved_quantity, has_quantity_limit FROM components WHERE id = ANY($1::uuid[]) FOR UPDATE',
        [requestedIds]
      );
      const componentById = new Map(componentRows.map((c) => [c.id, c]));

      for (const [componentId, quantity] of requested) {
        const component = componentById.get(componentId);
        if (!component) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Cart references a component that does not exist.' });
        }
        if (component.has_quantity_limit) {
          const available = component.total_quantity - component.reserved_quantity;
          if (quantity > available) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Only ${available} of that component are available.` });
          }
        }
      }
    }

    const { rows: reqRows } = await client.query(
      `INSERT INTO requests (team_id, status) VALUES ($1, 'PENDING_APPROVAL') RETURNING *`,
      [teamId]
    );
    const newRequest = reqRows[0];

    // Skip unlimited components (WHERE guard inside adjustStock makes this a no-op for them)
    await adjustStock(client, cart, 'reserved_quantity', 1);

    if (cart.length > 0) {
      await client.query(
        `INSERT INTO request_items (request_id, component_id, quantity)
         SELECT $1, unnest($2::uuid[]), unnest($3::int[])`,
        [newRequest.id, cart.map(i => i.componentId), cart.map(i => i.quantity)]
      );
    }
    const items = cart.map(item => ({ componentId: item.componentId, quantity: item.quantity }));

    await client.query('COMMIT');

    res.json({
      id: newRequest.id,
      teamId: newRequest.team_id,
      status: newRequest.status,
      timestamp: newRequest.timestamp,
      notes: newRequest.notes,
      items
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Update Request Status (Admin)
app.patch('/api/requests/:id', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, items, notes } = req.body; // items is optional
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: oldRows } = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (oldRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).send('Request not found');
    }
    const oldRequest = oldRows[0];

    const { rows: oldItemRows } = await client.query(
      'SELECT component_id, quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    const newItems = items ? items : oldItemRows.map(r => ({ componentId: r.component_id, quantity: r.quantity }));
    const newStatus = status ? status : oldRequest.status;

    // Helper to determine what bucket the stock falls into
    // RESERVED: Counts towards reservedQuantity
    // FINALIZED: Counts as deducted from totalQuantity
    // NONE: No impact (e.g. REJECTED)
    const getStockImpactType = (s) => {
      if (ACTIVE_STATUSES.includes(s)) return 'RESERVED';
      if (s === 'COLLECTED') return 'FINALIZED';
      return 'NONE';
    };

    const oldType = getStockImpactType(oldRequest.status);
    const newType = getStockImpactType(newStatus);

    // 1. Revert Old Impact (Undo what the old request was doing to the stock)
    if (oldType === 'RESERVED') {
      await adjustStock(client, oldItemRows, 'reserved_quantity', -1);
    } else if (oldType === 'FINALIZED') {
      await adjustStock(client, oldItemRows, 'total_quantity', 1);
    }

    // 2. Apply New Impact (Apply what the new request state should do)
    if (newType === 'RESERVED') {
      await adjustStock(client, newItems, 'reserved_quantity', 1);
    } else if (newType === 'FINALIZED') {
      await adjustStock(client, newItems, 'total_quantity', -1);
    }

    // 3. Update Request Record
    if (items) {
      await client.query('DELETE FROM request_items WHERE request_id = $1', [id]);
      if (items.length > 0) {
        await client.query(
          `INSERT INTO request_items (request_id, component_id, quantity)
           SELECT $1, unnest($2::uuid[]), unnest($3::int[])`,
          [id, items.map(i => i.componentId), items.map(i => i.quantity)]
        );
      }
    }

    const { rows: updatedRows } = await client.query(
      'UPDATE requests SET status = $1, notes = $2 WHERE id = $3 RETURNING *',
      [newStatus, notes !== undefined ? notes : oldRequest.notes, id]
    );

    const { rows: finalItemRows } = await client.query(
      'SELECT component_id, quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    await client.query('COMMIT');

    const updated = updatedRows[0];
    res.json({
      id: updated.id,
      teamId: updated.team_id,
      status: updated.status,
      timestamp: updated.timestamp,
      notes: updated.notes,
      items: finalItemRows.map(i => ({ componentId: i.component_id, quantity: i.quantity }))
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Reinstate Inventory (Admin - Return collected items to stock)
app.patch('/api/requests/:id/reinstate', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const returnedByName = typeof req.body?.returnedBy?.name === 'string' ? req.body.returnedBy.name.trim() : '';
  const returnedByRegNum = typeof req.body?.returnedBy?.registrationNumber === 'string' ? req.body.returnedBy.registrationNumber.trim() : '';
  // Whoever is physically handing the components back must identify themselves —
  // this is the accountability record for "who returned this," not just a UI nicety,
  // so it's enforced here rather than only in the confirmation modal that collects it.
  if (!returnedByName || !returnedByRegNum) {
    return res.status(400).json({ error: 'Name and registration number of the person returning the components are required.' });
  }

  // Optional partial-return spec: which components, and how many units of each,
  // are being handed back in this specific action. Omitting it (or sending an
  // empty array) returns everything still outstanding — the common "hand it all
  // back at once" case needs no extra input from the client.
  const requestedReturns = Array.isArray(req.body?.items) && req.body.items.length > 0 ? req.body.items : null;
  if (requestedReturns) {
    for (const item of requestedReturns) {
      if (!isValidUUID(item?.componentId) || !Number.isInteger(item?.quantity) || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each returned item needs a valid componentId and a positive integer quantity.' });
      }
    }
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    const request = rows[0];

    // Can only reinstate from COLLECTED status
    if (request.status !== 'COLLECTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Can only reinstate inventory from collected requests' });
    }

    const { rows: itemRows } = await client.query(
      'SELECT id, component_id, quantity, returned_quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    // Resolve exactly how much of each item is being returned in this action:
    // the caller's specified amount where given, else everything still outstanding.
    const returnsByComponent = requestedReturns
      ? new Map(requestedReturns.map(i => [i.componentId, i.quantity]))
      : null;

    const toReturn = [];
    for (const row of itemRows) {
      const outstanding = row.quantity - row.returned_quantity;
      if (outstanding <= 0) continue;
      const wanted = returnsByComponent ? returnsByComponent.get(row.component_id) : outstanding;
      if (wanted === undefined) continue; // not included in this partial return
      if (wanted > outstanding) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot return ${wanted} of a component with only ${outstanding} outstanding.` });
      }
      toReturn.push({ itemId: row.id, componentId: row.component_id, quantity: wanted });
    }

    if (returnsByComponent) {
      // Every componentId the caller asked to return must actually match an
      // outstanding item on this request (not already fully returned / not on it at all).
      for (const componentId of returnsByComponent.keys()) {
        if (!toReturn.some(r => r.componentId === componentId)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'One of the components in this return is not outstanding on this request.' });
        }
      }
    }

    if (toReturn.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Nothing to return — every item on this request has already been returned.' });
    }

    // Restore the components to totalQuantity for exactly the amounts being
    // returned now (skip unlimited) — not the full original quantities, which
    // would double-credit stock an earlier partial return already restored.
    await adjustStock(client, toReturn, 'total_quantity', 1);

    for (const r of toReturn) {
      await client.query(
        'UPDATE request_items SET returned_quantity = returned_quantity + $1 WHERE id = $2',
        [r.quantity, r.itemId]
      );
    }

    // Fully returned only once every item's returned_quantity has caught up
    // with its original quantity — otherwise the team is still holding
    // something, so the request (and its "Reinstate" option) stays live.
    const stillOutstanding = itemRows.some(row => {
      const justReturned = toReturn.find(r => r.itemId === row.id);
      const newReturnedQty = row.returned_quantity + (justReturned ? justReturned.quantity : 0);
      return newReturnedQty < row.quantity;
    });
    const newStatus = stillOutstanding ? 'COLLECTED' : 'RETURNED_TO_INVENTORY';

    const { rows: compRows } = await client.query(
      'SELECT id, name FROM components WHERE id = ANY($1::uuid[])',
      [toReturn.map(r => r.componentId)]
    );
    const componentNames = new Map(compRows.map(c => [c.id, c.name]));
    const itemsSummary = toReturn.map(r => `${componentNames.get(r.componentId) ?? 'component'} x${r.quantity}`).join(', ');
    const returnReceipt = `Returned by ${returnedByName} (Reg: ${returnedByRegNum}) on ${new Date().toISOString()}: ${itemsSummary}`;
    const combinedNotes = request.notes ? `${request.notes}\n${returnReceipt}` : returnReceipt;

    const { rows: updatedRows } = await client.query(
      `UPDATE requests SET status = $2, notes = $3 WHERE id = $1 RETURNING *`,
      [id, newStatus, combinedNotes]
    );

    const { rows: teamRows } = await client.query('SELECT team_name FROM teams WHERE id = $1', [request.team_id]);
    await recordAuditLog(client, {
      action: 'REINSTATE_REQUEST',
      actorName: returnedByName,
      actorRegistrationNumber: returnedByRegNum,
      targetType: 'request',
      targetId: id,
      details: { teamName: teamRows[0]?.team_name ?? null, teamId: request.team_id, items: toReturn, fullyReturned: !stillOutstanding }
    });

    await client.query('COMMIT');

    const { rows: finalItemRows } = await client.query(
      'SELECT component_id, quantity, returned_quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    const updated = updatedRows[0];
    res.json({
      id: updated.id,
      teamId: updated.team_id,
      status: updated.status,
      timestamp: updated.timestamp,
      notes: updated.notes,
      items: finalItemRows.map(i => ({ componentId: i.component_id, quantity: i.quantity, returnedQuantity: i.returned_quantity }))
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Delete Request (Admin - Delete History)
app.delete('/api/requests/:id', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const deletedByName = typeof req.body?.deletedBy?.name === 'string' ? req.body.deletedBy.name.trim() : '';
  const deletedByRegNum = typeof req.body?.deletedBy?.registrationNumber === 'string' ? req.body.deletedBy.registrationNumber.trim() : '';
  if (!deletedByName || !deletedByRegNum) {
    return res.status(400).json({ error: 'Name and registration number of the admin authorizing this deletion are required.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    const request = rows[0];

    const { rows: itemRows } = await client.query(
      'SELECT component_id, quantity, returned_quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    // Restore stock based on status
    if (request.status === 'COLLECTED') {
      // If collected, it was deducted from Total — restore only what's still
      // outstanding (quantity - returned_quantity). A partial return may have
      // already restored some of it; crediting the full original quantity here
      // would double-count that portion.
      const outstandingItems = itemRows
        .map(r => ({ componentId: r.component_id, quantity: r.quantity - r.returned_quantity }))
        .filter(r => r.quantity > 0);
      await adjustStock(client, outstandingItems, 'total_quantity', 1);
    } else if (ACTIVE_STATUSES.includes(request.status)) {
      // If Reserved, release reservation (skip unlimited).
      await adjustStock(client, itemRows, 'reserved_quantity', -1);
    }
    // If Rejected/Returned, stock was already released/restored, just delete record.

    const { rows: teamRows } = await client.query('SELECT team_name FROM teams WHERE id = $1', [request.team_id]);
    await recordAuditLog(client, {
      action: 'DELETE_REQUEST',
      actorName: deletedByName,
      actorRegistrationNumber: deletedByRegNum,
      targetType: 'request',
      targetId: id,
      details: { teamName: teamRows[0]?.team_name ?? null, teamId: request.team_id, status: request.status, items: itemRows }
    });

    await client.query('DELETE FROM requests WHERE id = $1', [id]); // cascades to request_items

    await client.query('COMMIT');
    res.json({ message: 'Request deleted and stock restored' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Manage Components
app.put('/api/components', checkDbConnection, requireAdmin, async (req, res) => {
  const { id, name, category, totalQuantity, hasQuantityLimit } = req.body;
  try {
    let row;
    if (id && isValidUUID(id)) {
      const { rows } = await pool.query(
        `UPDATE components
         SET name = COALESCE($1, name),
             category = COALESCE($2, category),
             total_quantity = COALESCE($3, total_quantity),
             has_quantity_limit = COALESCE($4, has_quantity_limit)
         WHERE id = $5
         RETURNING *`,
        [name, category, totalQuantity, hasQuantityLimit, id]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO components (name, category, total_quantity, reserved_quantity, has_quantity_limit)
         VALUES ($1, $2, $3, 0, $4)
         RETURNING *`,
        [name, category, totalQuantity, hasQuantityLimit !== undefined ? hasQuantityLimit : true]
      );
      row = rows[0];
    }
    res.json(mapComponent(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Component (Admin) — blocks the delete if any team is still
// physically holding it (COLLECTED, not yet returned) and returns exactly who,
// so the admin can go collect it back before trying again. Once clear, any
// team with an active (not-yet-collected) request for it has just that line
// item stripped out with an explanatory note appended to the request — the
// closest thing this polling-based app has to a push notification, since
// RequestHistory already renders notes live on every 2s refresh.
app.delete('/api/components/:id', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid component id.' });
  }

  const deletedByName = typeof req.body?.deletedBy?.name === 'string' ? req.body.deletedBy.name.trim() : '';
  const deletedByRegNum = typeof req.body?.deletedBy?.registrationNumber === 'string' ? req.body.deletedBy.registrationNumber.trim() : '';
  // Whoever is authorizing a deletion must identify themselves — this is the
  // accountability record for "who deleted this resource," not just a UI
  // nicety, so it's enforced here rather than only in the confirmation card.
  if (!deletedByName || !deletedByRegNum) {
    return res.status(400).json({ error: 'Name and registration number of the admin authorizing this deletion are required.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: componentRows } = await client.query('SELECT * FROM components WHERE id = $1 FOR UPDATE', [id]);
    if (componentRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Component not found.' });
    }
    const component = componentRows[0];

    // A COLLECTED request can still have this specific component already fully
    // returned while other items on it remain outstanding — filter and report
    // on (quantity - returned_quantity) per item, not the request's status alone.
    const { rows: holderRows } = await client.query(
      `SELECT r.id AS request_id, r.timestamp, r.team_id, t.team_name, t.leader_name, t.registration_number,
              (ri.quantity - ri.returned_quantity) AS quantity
       FROM requests r
       JOIN request_items ri ON ri.request_id = r.id
       JOIN teams t ON t.id = r.team_id
       WHERE ri.component_id = $1 AND r.status = 'COLLECTED' AND ri.quantity > ri.returned_quantity
       ORDER BY r.timestamp DESC`,
      [id]
    );
    if (holderRows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `"${component.name}" is still collected by ${holderRows.length} team${holderRows.length === 1 ? '' : 's'} and cannot be deleted until it's returned.`,
        holders: holderRows.map(row => ({
          requestId: row.request_id,
          teamId: row.team_id,
          teamName: row.team_name,
          leaderName: row.leader_name,
          registrationNumber: row.registration_number,
          quantity: row.quantity,
          timestamp: row.timestamp
        }))
      });
    }

    // Not physically held anywhere — safe to delete. Strip this item out of
    // any active (not yet collected) request and explain why, instead of
    // silently leaving the request referencing something that vanished.
    const { rows: activeRows } = await client.query(
      `SELECT r.id AS request_id, r.notes, t.team_name, ri.id AS item_id, ri.quantity
       FROM requests r
       JOIN request_items ri ON ri.request_id = r.id
       JOIN teams t ON t.id = r.team_id
       WHERE ri.component_id = $1 AND r.status = ANY($2::text[])`,
      [id, ACTIVE_STATUSES]
    );

    const deletedAt = new Date().toISOString();
    const notice = `"${component.name}" was removed from inventory by ${deletedByName} (Reg: ${deletedByRegNum}) on ${deletedAt} and could not be provided for this request.`;
    const notifiedTeams = [];
    for (const row of activeRows) {
      await client.query('DELETE FROM request_items WHERE id = $1', [row.item_id]);
      const combinedNotes = row.notes ? `${row.notes}\n${notice}` : notice;
      await client.query('UPDATE requests SET notes = $1 WHERE id = $2', [combinedNotes, row.request_id]);
      notifiedTeams.push({ requestId: row.request_id, teamName: row.team_name, quantity: row.quantity });
    }

    // Historical (rejected/returned) request_items rows referencing this
    // component are left alone — ON DELETE SET NULL orphans their
    // component_id automatically, and the API/UI already treat that as
    // "component: null" / "Unknown component".
    await client.query('DELETE FROM components WHERE id = $1', [id]);

    await recordAuditLog(client, {
      action: 'DELETE_COMPONENT',
      actorName: deletedByName,
      actorRegistrationNumber: deletedByRegNum,
      targetType: 'component',
      targetId: id,
      details: { componentName: component.name, category: component.category, notifiedTeams }
    });

    await client.query('COMMIT');
    console.log(`Component "${component.name}" (${id}) deleted by ${deletedByName} (Reg: ${deletedByRegNum}) at ${deletedAt}`);
    res.json({ message: `"${component.name}" deleted.`, notifiedTeams, deletedBy: { name: deletedByName, registrationNumber: deletedByRegNum }, deletedAt });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Get Team Credentials (Admin) — passwords are only shown once at registration
// in the UI, but they're stored encrypted (not lost), so an admin who missed
// that one-time display can look them back up here rather than being stuck
// deleting and re-registering the team.
app.get('/api/teams/:id/credentials', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid team id.' });
  }
  try {
    const { rows } = await pool.query('SELECT team_name, password FROM teams WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Team not found.' });
    }
    let password;
    try {
      password = decryptTeamPassword(rows[0].password);
    } catch (decryptErr) {
      console.error('Failed to decrypt stored team password:', decryptErr.message);
      return res.status(500).json({ error: 'Unable to decrypt stored password.' });
    }
    res.json({ teamName: rows[0].team_name, password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Team Member — open to the team's own leader while the roster is still
// unlocked. This app has no per-participant session token (the participant
// login flow only ever trusted the client-supplied teamId, the same as
// POST /api/requests already does), so this route trusts :id the same way.
// Once locked, only a valid admin token can add further members, and that
// path is credentialed and logged the same way reinstate/delete already are.
app.post('/api/teams/:id/members', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid team id.' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const registrationNumber = typeof req.body?.registrationNumber === 'string' ? req.body.registrationNumber.trim() : '';
  if (!name || !registrationNumber) {
    return res.status(400).json({ error: 'Member name and registration number are required.' });
  }

  const isAdmin = isValidAdminToken(req.headers['x-admin-token']);
  let changedByName = '';
  let changedByRegNum = '';
  if (isAdmin) {
    changedByName = typeof req.body?.changedBy?.name === 'string' ? req.body.changedBy.name.trim() : '';
    changedByRegNum = typeof req.body?.changedBy?.registrationNumber === 'string' ? req.body.changedBy.registrationNumber.trim() : '';
    if (!changedByName || !changedByRegNum) {
      return res.status(400).json({ error: 'Name and registration number of the admin authorizing this change are required.' });
    }
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1 FOR UPDATE', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found.' });
    }
    const team = teamRows[0];

    if (team.roster_locked && !isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "This team's roster is locked. Contact an admin to make changes." });
    }

    const { rows: memberRows } = await client.query('SELECT * FROM team_members WHERE team_id = $1', [id]);
    if (1 + memberRows.length >= MAX_TEAM_SIZE) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `A team can have at most ${MAX_TEAM_SIZE} participants, including the leader.` });
    }

    let insertedRows;
    try {
      ({ rows: insertedRows } = await client.query(
        'INSERT INTO team_members (team_id, name, registration_number) VALUES ($1, $2, $3) RETURNING *',
        [id, name, registrationNumber]
      ));
    } catch (insertErr) {
      if (insertErr.code === '23505') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This registration number is already registered to a team member.' });
      }
      throw insertErr;
    }

    if (isAdmin) {
      await recordAuditLog(client, {
        action: 'ADD_TEAM_MEMBER',
        actorName: changedByName,
        actorRegistrationNumber: changedByRegNum,
        targetType: 'team',
        targetId: id,
        details: { teamName: team.team_name, memberName: name, memberRegistrationNumber: registrationNumber }
      });
    }

    await client.query('COMMIT');
    res.status(201).json(mapTeamMember(insertedRows[0]));
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Remove Team Member — same open-pre-lock / admin-only-post-lock split as adding one.
app.delete('/api/teams/:id/members/:memberId', checkDbConnection, async (req, res) => {
  const { id, memberId } = req.params;
  if (!isValidUUID(id) || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'Invalid team or member id.' });
  }

  const isAdmin = isValidAdminToken(req.headers['x-admin-token']);
  let changedByName = '';
  let changedByRegNum = '';
  if (isAdmin) {
    changedByName = typeof req.body?.changedBy?.name === 'string' ? req.body.changedBy.name.trim() : '';
    changedByRegNum = typeof req.body?.changedBy?.registrationNumber === 'string' ? req.body.changedBy.registrationNumber.trim() : '';
    if (!changedByName || !changedByRegNum) {
      return res.status(400).json({ error: 'Name and registration number of the admin authorizing this change are required.' });
    }
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1 FOR UPDATE', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found.' });
    }
    const team = teamRows[0];

    if (team.roster_locked && !isAdmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "This team's roster is locked. Contact an admin to make changes." });
    }

    const { rows: memberRows } = await client.query('SELECT * FROM team_members WHERE id = $1 AND team_id = $2', [memberId, id]);
    if (memberRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Member not found on this team.' });
    }
    const member = memberRows[0];

    await client.query('DELETE FROM team_members WHERE id = $1', [memberId]);

    if (isAdmin) {
      await recordAuditLog(client, {
        action: 'REMOVE_TEAM_MEMBER',
        actorName: changedByName,
        actorRegistrationNumber: changedByRegNum,
        targetType: 'team',
        targetId: id,
        details: { teamName: team.team_name, memberName: member.name, memberRegistrationNumber: member.registration_number }
      });
    }

    await client.query('COMMIT');
    res.json({ message: 'Member removed.' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Finalize Team Roster — the leader's one-way action once they've settled on
// 3-4 total participants. After this, POST/DELETE on team_members above only
// accept an admin token, per roster_locked.
app.post('/api/teams/:id/lock', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid team id.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1 FOR UPDATE', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found.' });
    }
    const team = teamRows[0];

    if (team.roster_locked) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "This team's roster is already locked." });
    }

    const { rows: memberRows } = await client.query('SELECT * FROM team_members WHERE team_id = $1', [id]);
    const totalSize = 1 + memberRows.length;
    if (totalSize < MIN_TEAM_SIZE || totalSize > MAX_TEAM_SIZE) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `A team needs ${MIN_TEAM_SIZE}-${MAX_TEAM_SIZE} participants (including the leader) to finalize. This team currently has ${totalSize}.`
      });
    }

    const { rows: updatedRows } = await client.query('UPDATE teams SET roster_locked = TRUE WHERE id = $1 RETURNING *', [id]);

    await client.query('COMMIT');
    res.json(mapTeam(updatedRows[0], memberRows));
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Edit Team Leader Name — admin-only correction (typos, name changes), unlike
// add/remove-member which is open to the team itself pre-lock. Credentialed
// and audit-logged the same way every other admin data change is.
app.patch('/api/teams/:id/leader-name', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const leaderName = typeof req.body?.leaderName === 'string' ? req.body.leaderName.trim() : '';
  const changedByName = typeof req.body?.changedBy?.name === 'string' ? req.body.changedBy.name.trim() : '';
  const changedByRegNum = typeof req.body?.changedBy?.registrationNumber === 'string' ? req.body.changedBy.registrationNumber.trim() : '';
  if (!leaderName) {
    return res.status(400).json({ error: 'Leader name is required.' });
  }
  if (!changedByName || !changedByRegNum) {
    return res.status(400).json({ error: 'Name and registration number of the admin authorizing this change are required.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1 FOR UPDATE', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found.' });
    }
    const previousName = teamRows[0].leader_name;

    const { rows: updatedRows } = await client.query(
      'UPDATE teams SET leader_name = $1 WHERE id = $2 RETURNING *',
      [leaderName, id]
    );

    await recordAuditLog(client, {
      action: 'EDIT_TEAM_LEADER',
      actorName: changedByName,
      actorRegistrationNumber: changedByRegNum,
      targetType: 'team',
      targetId: id,
      details: { teamName: teamRows[0].team_name, previousName, newName: leaderName }
    });

    await client.query('COMMIT');
    const { rows: memberRows } = await client.query('SELECT * FROM team_members WHERE team_id = $1 ORDER BY added_at', [id]);
    res.json(mapTeam(updatedRows[0], memberRows));
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Edit Team Member Name — same admin-only, credentialed, audit-logged pattern.
app.patch('/api/teams/:id/members/:memberId', checkDbConnection, requireAdmin, async (req, res) => {
  const { id, memberId } = req.params;
  if (!isValidUUID(id) || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'Invalid team or member id.' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const changedByName = typeof req.body?.changedBy?.name === 'string' ? req.body.changedBy.name.trim() : '';
  const changedByRegNum = typeof req.body?.changedBy?.registrationNumber === 'string' ? req.body.changedBy.registrationNumber.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'Member name is required.' });
  }
  if (!changedByName || !changedByRegNum) {
    return res.status(400).json({ error: 'Name and registration number of the admin authorizing this change are required.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1 FOR UPDATE', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found.' });
    }

    const { rows: memberRows } = await client.query('SELECT * FROM team_members WHERE id = $1 AND team_id = $2', [memberId, id]);
    if (memberRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Member not found on this team.' });
    }
    const previousName = memberRows[0].name;

    const { rows: updatedRows } = await client.query(
      'UPDATE team_members SET name = $1 WHERE id = $2 RETURNING *',
      [name, memberId]
    );

    await recordAuditLog(client, {
      action: 'EDIT_TEAM_MEMBER',
      actorName: changedByName,
      actorRegistrationNumber: changedByRegNum,
      targetType: 'team',
      targetId: id,
      details: { teamName: teamRows[0].team_name, previousName, newName: name }
    });

    await client.query('COMMIT');
    res.json(mapTeamMember(updatedRows[0]));
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Audit Log (Admin) — read-only view of recorded actions (reinstate, delete
// component, delete request). `?limit=` caps the page size (default 100, max 500).
app.get('/api/audit-log', checkDbConnection, requireAdmin, async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  try {
    const { rows } = await pool.query(
      `SELECT id, action, actor_name, actor_registration_number, target_type, target_id, details, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows.map(row => ({
      id: row.id,
      action: row.action,
      actorName: row.actor_name,
      actorRegistrationNumber: row.actor_registration_number,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      createdAt: row.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Team (Admin)
app.delete('/api/teams/:id', checkDbConnection, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const deletedByName = typeof req.body?.deletedBy?.name === 'string' ? req.body.deletedBy.name.trim() : '';
  const deletedByRegNum = typeof req.body?.deletedBy?.registrationNumber === 'string' ? req.body.deletedBy.registrationNumber.trim() : '';
  // Same accountability requirement as reinstate/delete-component/delete-request:
  // whoever is authorizing this deletion must identify themselves, enforced
  // here rather than only in the confirmation card that collects it.
  if (!deletedByName || !deletedByRegNum) {
    return res.status(400).json({ error: 'Name and registration number of the admin authorizing this deletion are required.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found' });
    }
    const team = teamRows[0];

    // Block deletion while the team is still physically holding collected
    // components. The old behaviour silently restored total_quantity on delete —
    // treating "the record is gone" as "the hardware came back" — which let a
    // team disappear from the roster while still holding components in real life.
    // Report only what's still outstanding per item (quantity - returned_quantity)
    // — a partial return can leave a COLLECTED request with some items already
    // fully returned while others on the same request are still out.
    const { rows: unreturnedRows } = await client.query(
      `SELECT r.id AS request_id, r.timestamp,
              ri.component_id, (ri.quantity - ri.returned_quantity) AS quantity, c.name AS component_name, c.category
       FROM requests r
       JOIN request_items ri ON ri.request_id = r.id
       JOIN components c ON c.id = ri.component_id
       WHERE r.team_id = $1 AND r.status = 'COLLECTED' AND ri.quantity > ri.returned_quantity
       ORDER BY r.timestamp DESC`,
      [id]
    );
    if (unreturnedRows.length > 0) {
      const byRequest = new Map();
      for (const row of unreturnedRows) {
        if (!byRequest.has(row.request_id)) {
          byRequest.set(row.request_id, { requestId: row.request_id, timestamp: row.timestamp, items: [] });
        }
        byRequest.get(row.request_id).items.push({
          componentId: row.component_id,
          name: row.component_name,
          category: row.category,
          quantity: row.quantity
        });
      }
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This team still has collected components that have not been returned to inventory.',
        requests: Array.from(byRequest.values())
      });
    }

    // Find all requests associated with this team
    const { rows: teamRequests } = await client.query('SELECT * FROM requests WHERE team_id = $1', [id]);

    // Restore stock for each request before deleting (reservations only now —
    // COLLECTED is handled by the block above, so nothing here should hit that branch).
    for (const request of teamRequests) {
      const { rows: itemRows } = await client.query(
        'SELECT component_id, quantity FROM request_items WHERE request_id = $1',
        [request.id]
      );

      if (ACTIVE_STATUSES.includes(request.status)) {
        await adjustStock(client, itemRows, 'reserved_quantity', -1);
      }
    }

    // Delete all requests associated with this team (cascades to request_items)
    await client.query('DELETE FROM requests WHERE team_id = $1', [id]);

    // Delete the team
    await client.query('DELETE FROM teams WHERE id = $1', [id]);

    await recordAuditLog(client, {
      action: 'DELETE_TEAM',
      actorName: deletedByName,
      actorRegistrationNumber: deletedByRegNum,
      targetType: 'team',
      targetId: id,
      details: {
        teamName: team.team_name,
        leaderName: team.leader_name,
        registrationNumber: team.registration_number,
        requestsDeleted: teamRequests.length
      }
    });

    await client.query('COMMIT');
    res.json({ message: 'Team and all associated requests deleted successfully' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Render's free tier spins the service down after 15 min with no inbound
// request, which would both cold-start the next request and wipe the
// in-memory adminSessions Map. RENDER_EXTERNAL_URL is set automatically on
// Render, so this self-ping is a no-op everywhere else (local dev, tests).
// ponytail: fixed 10-minute self-ping, no backoff/jitter — fine for a single
// short-lived event; revisit if this ever needs to run unattended for days.
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`).catch(() => {});
  }, 10 * 60 * 1000);
}
