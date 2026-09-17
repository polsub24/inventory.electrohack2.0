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
  console.warn('⚠️  ADMIN_SECRET is not set in .env — admin login will be unavailable.');
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
      if (!dbConnected) console.log('✅ PostgreSQL connection restored');
      dbConnected = true;
    }
  } catch {
    dbConnected = false;
  }
};

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
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
    console.log('✅ Connected to PostgreSQL');
    await initSchema();
    await seedAndSync();
    // Only mark the DB "ready" once the schema exists and seed/sync has run,
    // so requests that arrive right at startup can't hit a missing-table error.
    schemaReady = true;
    dbConnected = true;
  } catch (err) {
    console.error('❌ PostgreSQL connection error:', err.message);
    console.log(`💡 TIP: Check your DATABASE_URL and that PostgreSQL is running. Retrying in ${RECONNECT_DELAY_MS / 1000}s...`);
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
      password TEXT NOT NULL
    )
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
      component_id UUID REFERENCES components(id),
      quantity INTEGER NOT NULL
    )
  `);
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

const mapTeam = (t) => ({
  id: t.id,
  teamName: t.team_name,
  leaderName: t.leader_name,
  registrationNumber: t.registration_number
});

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
  console.log('🔄 Syncing inventory reservation counts...');
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
    console.log('✅ Inventory reservations synchronized.');
  } catch (err) {
    console.error('❌ Failed to sync inventory:', err.message);
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
    const [componentsRes, teamsRes, requestsRes] = await Promise.all([
      pool.query('SELECT * FROM components ORDER BY name'),
      pool.query('SELECT * FROM teams ORDER BY team_name'),
      pool.query(`
        SELECT r.id, r.team_id, r.status, r.timestamp, r.notes,
               t.id AS team_pk, t.team_name, t.leader_name, t.registration_number,
               ri.component_id, ri.quantity,
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

    res.json({
      components: componentsRes.rows.map(mapComponent),
      teams: teamsRes.rows.map(mapTeam),
      requests: Array.from(requestMap.values())
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Team Registration
app.post('/api/teams/register', checkDbConnection, async (req, res) => {
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
      [teamName.trim(), leaderName.trim(), registrationNumber.trim(), generatedPassword]
    );

    // Return the password in the response (only shown once during registration)
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

    if (team.password !== password) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // Don't send password back in response
    res.json(mapTeam(team));
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
  res.json({ ok: true });
});

// Submit Request
app.post('/api/requests', checkDbConnection, async (req, res) => {
  const { teamId } = req.body;
  const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

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
app.patch('/api/requests/:id', checkDbConnection, async (req, res) => {
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
app.patch('/api/requests/:id/reinstate', checkDbConnection, async (req, res) => {
  const { id } = req.params;
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
      'SELECT component_id, quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    // Restore the components to totalQuantity (reverse the collection, skip unlimited)
    await adjustStock(client, itemRows, 'total_quantity', 1);

    // Update request status to RETURNED_TO_INVENTORY
    const { rows: updatedRows } = await client.query(
      `UPDATE requests SET status = 'RETURNED_TO_INVENTORY' WHERE id = $1 RETURNING *`,
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
      items: itemRows.map(i => ({ componentId: i.component_id, quantity: i.quantity }))
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Delete Request (Admin - Delete History)
app.delete('/api/requests/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
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
      'SELECT component_id, quantity FROM request_items WHERE request_id = $1',
      [id]
    );

    // Restore stock based on status
    if (request.status === 'COLLECTED') {
      // If collected, it was deducted from Total. Restore Total (skip unlimited).
      await adjustStock(client, itemRows, 'total_quantity', 1);
    } else if (ACTIVE_STATUSES.includes(request.status)) {
      // If Reserved, release reservation (skip unlimited).
      await adjustStock(client, itemRows, 'reserved_quantity', -1);
    }
    // If Rejected, stock was already released, just delete record.

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
app.put('/api/components', checkDbConnection, async (req, res) => {
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

// Delete Team (Admin)
app.delete('/api/teams/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: teamRows } = await client.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (teamRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found' });
    }

    // Find all requests associated with this team
    const { rows: teamRequests } = await client.query('SELECT * FROM requests WHERE team_id = $1', [id]);

    // Restore stock for each request before deleting
    for (const request of teamRequests) {
      const { rows: itemRows } = await client.query(
        'SELECT component_id, quantity FROM request_items WHERE request_id = $1',
        [request.id]
      );

      if (request.status === 'COLLECTED') {
        await adjustStock(client, itemRows, 'total_quantity', 1);
      } else if (ACTIVE_STATUSES.includes(request.status)) {
        await adjustStock(client, itemRows, 'reserved_quantity', -1);
      }
    }

    // Delete all requests associated with this team (cascades to request_items)
    await client.query('DELETE FROM requests WHERE team_id = $1', [id]);

    // Delete the team
    await client.query('DELETE FROM teams WHERE id = $1', [id]);

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

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
