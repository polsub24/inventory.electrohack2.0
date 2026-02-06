import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/electrohack';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
console.log('🔗 Attempting to connect to MongoDB...');
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('💡 TIP: Check your MONGODB_URI and IP whitelist in Atlas.');
  });

// Middleware to check DB connection status before handling requests
const checkDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) { // 1 = connected
    return res.status(503).json({ error: `Database not ready. Status code: ${mongoose.connection.readyState}` });
  }
  next();
};


// --- SCHEMAS ---
const ComponentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  totalQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 }
});

const TeamSchema = new mongoose.Schema({
  teamName: { type: String, required: true, unique: true },
  leaderName: { type: String, required: true },
  registrationNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const RequestSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  status: { type: String, required: true },
  items: [{
    componentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Component' },
    quantity: { type: Number, required: true }
  }],
  timestamp: { type: Date, default: Date.now },
  notes: String
});

const Component = mongoose.model('Component', ComponentSchema);
const Team = mongoose.model('Team', TeamSchema);
const Request = mongoose.model('Request', RequestSchema);

// --- HELPER: STOCK RECALCULATION ---
// This fixes data drift (like negative reserved quantities) by syncing DB with actual active requests
const recalculateInventory = async () => {
  if (mongoose.connection.readyState !== 1) return;

  console.log('🔄 Syncing inventory reservation counts...');
  try {
    // 1. Reset all reserved counts to 0
    await Component.updateMany({}, { $set: { reservedQuantity: 0 } });

    // 2. Find all active requests (Pending, Modified, Approved)
    const activeRequests = await Request.find({
      status: { $in: ['PENDING_APPROVAL', 'MODIFIED_BY_ADMIN', 'APPROVED_READY'] }
    });

    // 3. Sum up quantities per component
    const reservationMap = {};
    activeRequests.forEach(req => {
      req.items.forEach(item => {
        const id = item.componentId.toString();
        reservationMap[id] = (reservationMap[id] || 0) + item.quantity;
      });
    });

    // 4. Update components
    for (const [id, qty] of Object.entries(reservationMap)) {
      await Component.findByIdAndUpdate(id, { reservedQuantity: qty });
    }
    console.log('✅ Inventory reservations synchronized.');
  } catch (err) {
    console.error('❌ Failed to sync inventory:', err.message);
  }
};

// --- API ROUTES ---

// Health check to verify server and DB status
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isConnected = dbState === 1;
  res.status(isConnected ? 200 : 503).json({
    status: 'ok',
    database: {
      connected: isConnected,
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState]
    }
  });
});


// Initial seed and Sync
const seedAndSync = async () => {
  try {
    const count = await Component.countDocuments();
    if (count === 0) {
      const mock = [
        { name: 'Arduino Uno', category: 'Modules', totalQuantity: 20, reservedQuantity: 0 },
        { name: 'ESP32', category: 'Modules', totalQuantity: 15, reservedQuantity: 0 },
        { name: 'DHT11 Sensor', category: 'Sensors', totalQuantity: 50, reservedQuantity: 0 },
        { name: 'Servo Motor SG90', category: 'Modules', totalQuantity: 10, reservedQuantity: 0 }
      ];
      await Component.insertMany(mock);
      console.log('🌱 Database seeded with initial components');
    }
    await recalculateInventory();
  } catch (err) {
    console.error("Seed/Sync failed:", err.message);
  }
};
// Wait a moment for DB connection before attempting
setTimeout(seedAndSync, 2000);

// Get full inventory state
app.get('/api/inventory', checkDbConnection, async (req, res) => {
  try {
    const [components, teams, requests] = await Promise.all([
      Component.find(),
      Team.find(),
      Request.find().populate('teamId').populate('items.componentId')
    ]);

    // Map Mongo objects to frontend expectations
    const mappedRequests = requests.map(r => ({
      id: r._id,
      teamId: r.teamId?._id,
      team: r.teamId,
      status: r.status,
      timestamp: r.timestamp,
      notes: r.notes,
      items: r.items.map(i => ({
        componentId: i.componentId?._id,
        quantity: i.quantity,
        component: i.componentId
      }))
    }));

    res.json({
      components: components.map(c => ({ ...c.toObject(), id: c._id })),
      teams: teams.map(t => ({ ...t.toObject(), id: t._id })),
      requests: mappedRequests
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
    const existingTeamByName = await Team.findOne({ teamName: { $regex: new RegExp(`^${teamName.trim()}$`, 'i') } });
    if (existingTeamByName) {
      return res.status(409).json({ error: 'This team name is already taken.' });
    }

    const existingTeamByReg = await Team.findOne({ registrationNumber: { $regex: new RegExp(`^${registrationNumber.trim()}$`, 'i') } });
    if (existingTeamByReg) {
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

    const newTeam = new Team({
      teamName: teamName.trim(),
      leaderName: leaderName.trim(),
      registrationNumber: registrationNumber.trim(),
      password: generatedPassword
    });
    await newTeam.save();

    // Return the password in the response (only shown once during registration)
    res.status(201).json({
      ...newTeam.toObject(),
      id: newTeam._id,
      password: generatedPassword // Include password in response
    });
  } catch (err) {
    if (err.code === 11000) { // Mongoose duplicate key error
      if (err.message.includes('teamName')) {
        return res.status(409).json({ error: 'This team name is already in use.' });
      }
      if (err.message.includes('registrationNumber')) {
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
    const team = await Team.findOne({ teamName: { $regex: new RegExp(`^${teamName.trim()}$`, 'i') } });
    if (!team) {
      return res.status(404).json({ error: 'Team not found. Please register first.' });
    }

    // Verify password
    if (team.password !== password) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    // Don't send password back in response
    const { password: _, ...teamData } = team.toObject();
    res.json({ ...teamData, id: team._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit Request
app.post('/api/requests', checkDbConnection, async (req, res) => {
  const { teamId, cart } = req.body;
  try {
    const newRequest = new Request({
      teamId,
      status: 'PENDING_APPROVAL',
      items: cart.map(item => ({
        componentId: item.componentId,
        quantity: item.quantity
      }))
    });

    // Update reserved quantities atomically
    for (const item of cart) {
      await Component.findByIdAndUpdate(item.componentId, {
        $inc: { reservedQuantity: item.quantity }
      });
    }

    await newRequest.save();
    res.json(newRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Request Status (Admin)
app.patch('/api/requests/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  const { status, items, notes } = req.body; // items is optional

  try {
    const oldRequest = await Request.findById(id);
    if (!oldRequest) return res.status(404).send('Request not found');

    const newItems = items ? items : oldRequest.items;
    const newStatus = status ? status : oldRequest.status;

    // Helper to determine what bucket the stock falls into
    // RESERVED: Counts towards reservedQuantity
    // FINALIZED: Counts as deducted from totalQuantity
    // NONE: No impact (e.g. REJECTED)
    const getStockImpactType = (s) => {
      if (['PENDING_APPROVAL', 'MODIFIED_BY_ADMIN', 'APPROVED_READY'].includes(s)) return 'RESERVED';
      if (s === 'COLLECTED') return 'FINALIZED';
      return 'NONE';
    };

    const oldType = getStockImpactType(oldRequest.status);
    const newType = getStockImpactType(newStatus);

    // 1. Revert Old Impact (Undo what the old request was doing to the stock)
    if (oldType === 'RESERVED') {
      for (const item of oldRequest.items) {
        await Component.findByIdAndUpdate(item.componentId, { $inc: { reservedQuantity: -item.quantity } });
      }
    } else if (oldType === 'FINALIZED') {
      for (const item of oldRequest.items) {
        await Component.findByIdAndUpdate(item.componentId, { $inc: { totalQuantity: item.quantity } });
      }
    }

    // 2. Apply New Impact (Apply what the new request state should do)
    if (newType === 'RESERVED') {
      for (const item of newItems) {
        await Component.findByIdAndUpdate(item.componentId, { $inc: { reservedQuantity: item.quantity } });
      }
    } else if (newType === 'FINALIZED') {
      for (const item of newItems) {
        await Component.findByIdAndUpdate(item.componentId, { $inc: { totalQuantity: -item.quantity } });
      }
    }

    // 3. Update Request Record
    const updateData = { status: newStatus, notes };
    if (items) {
      updateData.items = items.map(i => ({ componentId: i.componentId, quantity: i.quantity }));
    }

    const updated = await Request.findByIdAndUpdate(id, updateData, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Request (Admin - Delete History)
app.delete('/api/requests/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  try {
    const request = await Request.findById(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Restore stock based on status
    if (request.status === 'COLLECTED') {
      // If collected, it was deducted from Total. Restore Total.
      for (const item of request.items) {
        await Component.findByIdAndUpdate(item.componentId, {
          $inc: { totalQuantity: item.quantity }
        });
      }
    } else if (['PENDING_APPROVAL', 'MODIFIED_BY_ADMIN', 'APPROVED_READY'].includes(request.status)) {
      // If Reserved, release reservation.
      for (const item of request.items) {
        await Component.findByIdAndUpdate(item.componentId, {
          $inc: { reservedQuantity: -item.quantity }
        });
      }
    }
    // If Rejected, stock was already released, just delete record.

    await Request.findByIdAndDelete(id);
    res.json({ message: 'Request deleted and stock restored' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manage Components
app.put('/api/components', checkDbConnection, async (req, res) => {
  const { id, name, category, totalQuantity } = req.body;
  try {
    let component;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      component = await Component.findByIdAndUpdate(id, { name, category, totalQuantity }, { new: true });
    } else {
      component = new Component({ name, category, totalQuantity });
      await component.save();
    }
    res.json({ ...component.toObject(), id: component._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Team (Admin)
app.delete('/api/teams/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  try {
    const team = await Team.findById(id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Find all requests associated with this team
    const teamRequests = await Request.find({ teamId: id });

    // Restore stock for each request before deleting
    for (const request of teamRequests) {
      if (request.status === 'COLLECTED') {
        // If collected, it was deducted from Total. Restore Total.
        for (const item of request.items) {
          await Component.findByIdAndUpdate(item.componentId, {
            $inc: { totalQuantity: item.quantity }
          });
        }
      } else if (['PENDING_APPROVAL', 'MODIFIED_BY_ADMIN', 'APPROVED_READY'].includes(request.status)) {
        // If Reserved, release reservation.
        for (const item of request.items) {
          await Component.findByIdAndUpdate(item.componentId, {
            $inc: { reservedQuantity: -item.quantity }
          });
        }
      }
    }

    // Delete all requests associated with this team
    await Request.deleteMany({ teamId: id });

    // Delete the team
    await Team.findByIdAndDelete(id);

    res.json({ message: 'Team and all associated requests deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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