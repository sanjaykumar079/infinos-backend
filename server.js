// FILE: infinosbackend/server.js
// CRITICAL FIX: Proper CORS configuration for Amplify frontend

require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const deviceSimulator = require('./services/deviceSimulator');
const supabase = require('./config/supabase');

app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
  console.log('Server listening on port', process.env.PORT || 8080);
});
app.use((req, res, next) => {
  res.header(
    'Access-Control-Allow-Origin',
    'https://main.d385jmcqgfjtrz.amplifyapp.com'
  );
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ✅ FIXED: Single CORS configuration for Amplify frontend
const corsOptions = {
  origin: 'https://main.d385jmcqgfjtrz.amplifyapp.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Admin-Passkey',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', (req, res) => {
  res.sendStatus(200);
});
app.options('*', cors(corsOptions));

// ✅ Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  console.log('   Origin:', req.headers.origin || 'none');
  console.log('   Headers:', {
    auth: req.headers.authorization ? 'present' : 'none',
    admin: req.headers['x-admin-passkey'] ? 'present' : 'none',
  });
  next();
});

// ✅ Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Infinos Backend is running 🚀',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ✅ Health check
app.get('/health', (req, res) => {
  const runningSimulations = deviceSimulator.getRunningSimulations();
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    activeSimulations: runningSimulations.length,
    simulatingDevices: runningSimulations,
    supabaseConnected: !!process.env.SUPABASE_URL,
    timestamp: new Date().toISOString(),
  });
});

// ✅ Import routes
const testAPIRouter = require('./routes/testAPI');
const DeviceRouter = require('./routes/Device');
const authRouter = require('./routes/auth');

// ✅ Mount routes
app.use('/testAPI', testAPIRouter);
app.use('/device', DeviceRouter);
app.use('/auth', authRouter);

// ✅ Simple admin endpoint (for testing)
app.post('/admin/add-device', async (req, res) => {
  try {
    console.log('📥 Admin add device request:', req.body);
    
    const { name, device_code, bag_type, admin_key } = req.body;

    // Check admin key
    const expectedKey = process.env.ADMIN_PASSKEY || 'INFINOS2025ADMIN';
    if (admin_key !== expectedKey) {
      console.log('❌ Invalid admin key');
      return res.status(403).json({ message: 'Invalid admin key' });
    }

    // Validate required fields
    if (!name || !device_code || !bag_type) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if device already exists
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('device_code')
      .eq('device_code', device_code)
      .single();
      
    if (existingDevice) {
      console.log('❌ Device code already exists');
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
        battery_charge_level: 100,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }

    console.log('✅ Device created:', newDevice.name);
    res.status(201).json({
      message: 'Device created successfully',
      device: newDevice,
    });

  } catch (err) {
    console.error('❌ Error creating device:', err);
    res.status(500).json({ 
      message: 'Internal server error',
      error: err.message 
    });
  }
});

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS Error',
      message: 'Your domain is not allowed to access this API',
      origin: req.headers.origin,
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

// ✅ 404 handler
app.use((req, res) => {
  console.log('❌ 404:', req.method, req.path);
  res.status(404).json({ 
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// ✅ Start server
app.listen(PORT, async () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('🚀 INFINOS Backend Server Started');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ Missing'}`);
  console.log(`🔑 Admin Passkey: ${process.env.ADMIN_PASSKEY ? '✅ Configured' : '⚠️ Using default'}`);
  console.log(`🔐 CORS Origin: https://main.d385jmcqgfjtrz.amplifyapp.com`);
  console.log('='.repeat(60));
  console.log('');
  
  // Initialize device simulator
  console.log('🔄 Initializing device simulator...');
  setTimeout(async () => {
    await deviceSimulator.initializeAllSimulations();
    console.log('✅ Device simulator ready');
    console.log('');
  }, 2000);
});

// ✅ Graceful shutdown
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