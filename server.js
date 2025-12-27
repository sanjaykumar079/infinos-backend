// FILE: infinosbackend/server.js (REPLACE ENTIRE FILE)
// PRODUCTION READY - Fixed port 8080 and CORS configuration

require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const deviceSimulator = require('./services/deviceSimulator');
const supabase = require('./config/supabase');

// CRITICAL: Must use port 8080 for Elastic Beanstalk
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.status(200).send('Infinos Backend is running 🚀');
});

// Routes
const testAPIRouter = require('./routes/testAPI');
const DeviceRouter = require('./routes/Device');
const authRouter = require('./routes/auth');

// CORS Configuration - Add your Amplify URL after frontend deployment
const allowedOrigins = [
  'http://localhost:3000',
  'https://main.d1a2b3c4d5e6.amplifyapp.com',  // ← Your Amplify URL
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  const runningSimulations = deviceSimulator.getRunningSimulations();
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    activeSimulations: runningSimulations.length,
    simulatingDevices: runningSimulations
  });
});

// Routes
app.use('/testAPI', testAPIRouter);
app.use('/device', DeviceRouter);
app.use('/auth', authRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message 
  });
});

// Simple admin endpoint - add device
app.post('/admin/add-device', async (req, res) => {
  try {
    console.log('📥 Received add device request:', req.body);
    
    const { name, device_code, bag_type, admin_key } = req.body;

    // Check admin key
    if (admin_key !== process.env.ADMIN_KEY) {
      return res.status(403).json({ message: 'Invalid admin key' });
    }

    // Validate
    if (!name || !device_code || !bag_type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if exists
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('device_code')
      .eq('device_code', device_code)
      .single();
      
    if (existingDevice) {
      return res.status(400).json({ message: 'Device code already exists' });
    }

    // Generate device secret (random 32-character hex string)
    const device_secret = require('crypto').randomBytes(16).toString('hex');

    // Create device
    const { data: newDevice, error } = await supabase
      .from('devices')
      .insert({
        name,
        device_code,
        device_secret,
        bag_type,
        status: false,
        is_claimed: false,
        battery_charge_level: 100
      })
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Device created:', newDevice.name);

    res.status(201).json({
      message: 'Device created successfully',
      device: newDevice
    });

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server is running on Port: ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Auth routes mounted at /auth`);
  
  // Initialize device simulator for all online devices
  console.log('\n🔄 Initializing device simulator...');
  setTimeout(async () => {
    await deviceSimulator.initializeAllSimulations();
    console.log('✅ Device simulator ready\n');
  }, 2000); // Wait 2 seconds for server to be fully ready
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Server shutting down gracefully...');
  deviceSimulator.stopAllSimulations();
  process.exit(0);
});
  
process.on('SIGTERM', () => {
  console.log('\n\n🛑 Server shutting down gracefully...');
  deviceSimulator.stopAllSimulations();
  process.exit(0);
});