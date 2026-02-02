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
  teamName: { type: String, required: true },
  leaderName: { type: String, required: true },
  registrationNumber: { type: String, required: true, unique: true }
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


// Initial seed if empty
const seedDatabase = async () => {
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
  } catch (err) {
      console.error("Seeding failed. This may be okay if another instance is already seeding.", err.message);
  }
};
// Wait a moment for DB connection before attempting to seed
setTimeout(seedDatabase, 2000);

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

// Auth / Register
app.post('/api/teams/login', checkDbConnection, async (req, res) => {
  const { registrationNumber, teamName, leaderName } = req.body;
  try {
    let team = await Team.findOne({ registrationNumber: registrationNumber.toLowerCase() });
    if (!team) {
      team = new Team({ registrationNumber: registrationNumber.toLowerCase(), teamName, leaderName });
      await team.save();
    }
    res.json({ ...team.toObject(), id: team._id });
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
  const { status, items, notes } = req.body;
  try {
    const oldRequest = await Request.findById(id);
    if (!oldRequest) return res.status(404).send('Request not found');

    const originalStatus = oldRequest.status;
    
    // Logic for stock adjustments
    if (status === 'COLLECTED' && originalStatus !== 'COLLECTED') {
      // Move from reserved to finalized deduction
      for (const item of oldRequest.items) {
        await Component.findByIdAndUpdate(item.componentId, {
          $inc: { totalQuantity: -item.quantity, reservedQuantity: -item.quantity }
        });
      }
    } else if (status === 'REJECTED' && originalStatus !== 'REJECTED' && originalStatus !== 'COLLECTED') {
      // Release reservation
      for (const item of oldRequest.items) {
        await Component.findByIdAndUpdate(item.componentId, {
          $inc: { reservedQuantity: -item.quantity }
        });
      }
    }

    const updated = await Request.findByIdAndUpdate(id, 
      { status, notes, ...(items && { items: items.map(i => ({ componentId: i.componentId, quantity: i.quantity })) }) }, 
      { new: true }
    );
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
      // (Reserved was already cleared during collection)
      for (const item of request.items) {
        await Component.findByIdAndUpdate(item.componentId, {
          $inc: { totalQuantity: item.quantity }
        });
      }
    } else if (request.status !== 'REJECTED') {
      // If Pending, Modified, or Approved: Reserved quantity is still held.
      // Restore Reserved. (Total was never touched).
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

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));