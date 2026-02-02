
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
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

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

// Initial seed if empty
const seedDatabase = async () => {
  const count = await Component.countDocuments();
  if (count === 0) {
    const mock = [
      { name: 'Arduino Uno', category: 'Modules', totalQuantity: 20, reservedQuantity: 0 },
      { name: 'ESP32', category: 'Modules', totalQuantity: 15, reservedQuantity: 0 },
      { name: 'DHT11 Sensor', category: 'Sensors', totalQuantity: 50, reservedQuantity: 0 },
      { name: 'Servo Motor SG90', category: 'Modules', totalQuantity: 10, reservedQuantity: 0 }
    ];
    await Component.insertMany(mock);
    console.log('Database seeded with initial components');
  }
};
seedDatabase();

// Get full inventory state
app.get('/api/inventory', async (req, res) => {
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
app.post('/api/teams/login', async (req, res) => {
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
app.post('/api/requests', async (req, res) => {
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
app.patch('/api/requests/:id', async (req, res) => {
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

// Manage Components
app.put('/api/components', async (req, res) => {
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
