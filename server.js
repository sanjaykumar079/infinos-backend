// FILE: infinosbackend/server.js
// PRODUCTION READY - Fixed CORS and configuration

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

// FIXED CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'https://main.d385jmcqgfjtrz.amplifyapp.com', // ← NO trailing slash!
  /^https:\/\/.*\.amplifyapp\.com$/ // ← Proper regex for all Amplify branches
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-passkey']
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
    simulatingDevices: runningSimulations,
    supabaseConnected: !!process.env.SUPABASE_URL
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
    if (admin_key !== process.env.ADMIN_PASSKEY) {
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

    // Generate device secret
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
  console.log(`🔗 Supabase URL: ${process.env.SUPABASE_URL ? 'Connected' : 'Missing'}`);
  console.log(`✅ Auth routes mounted at /auth`);
  
  // Initialize device simulator
  console.log('\n🔄 Initializing device simulator...');
  setTimeout(async () => {
    await deviceSimulator.initializeAllSimulations();
    console.log('✅ Device simulator ready\n');
  }, 2000);
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