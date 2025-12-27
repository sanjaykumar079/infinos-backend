// FILE: infinosbackend/server.js
// CRITICAL FIX: Proper CORS configuration for Amplify frontend

require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const deviceSimulator = require('./services/deviceSimulator');
const supabase = require('./config/supabase');
import cors from "cors";


const PORT = process.env.PORT || 8080;

// ✅ FIXED: Allow your Amplify frontend domain
const allowedOrigins = [
  'http://localhost:3000',
  'https://main.d385jmcqgfjtrz.amplifyapp.com',  // Your Amplify domain
  'https://d385jmcqgfjtrz.amplifyapp.com',        // Root Amplify domain
  /^https:\/\/.*\.d385jmcqgfjtrz\.amplifyapp\.com$/,  // All Amplify branches
];

console.log('✅ Allowed origins:', allowedOrigins);
app.use(cors({
  origin: "https://main.d385jmcqgfjtrz.amplifyapp.com",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Admin-Passkey",
    "X-Requested-With",
    "Accept",
    "Origin"
  ]
}));

// 🔥 THIS LINE IS CRITICAL
app.options("*", cors());
// ✅ CRITICAL: CORS must be configured BEFORE routes
app.use(cors({
  origin: function(origin, callback) {
    console.log('🔍 CORS Check - Origin:', origin);
    
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      console.log('✅ No origin - allowing (Postman/mobile)');
      return callback(null, true);
    }
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        const match = origin === allowedOrigin;
        if (match) console.log(`✅ String match: ${origin} === ${allowedOrigin}`);
        return match;
      }
      if (allowedOrigin instanceof RegExp) {
        const match = allowedOrigin.test(origin);
        if (match) console.log(`✅ Regex match: ${origin} matches ${allowedOrigin}`);
        return match;
      }
      return false;
    });
    
    if (isAllowed) {
      console.log('✅ CORS - Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS - Origin blocked:', origin);
      console.log('   Add this domain to allowedOrigins in server.js');
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-admin-passkey',
    'Accept',
    'Origin',
    'X-Requested-With',
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 hours
}));

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
  console.log('='.repeat(60));
  console.log('📋 Allowed Origins:');
  allowedOrigins.forEach(origin => {
    console.log(`   - ${origin}`);
  });
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