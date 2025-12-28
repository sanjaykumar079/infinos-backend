// infinosbackend/server.js - FIXED VERSION

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const deviceSimulator = require('./services/deviceSimulator');

const app = express();

/* =========================
   PORT (FIXED)
========================= */
const PORT = process.env.PORT || 8080;

/* =========================
   CORS (FIXED FOR AMPLIFY)
========================= */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://main.d385jmcqgfjtrz.amplifyapp.com',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-admin-passkey',
    'X-Requested-With',
    'Accept'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 600
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* =========================
   BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   REQUEST LOGGER
========================= */
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  console.log('   Origin:', req.headers.origin || 'none');
  console.log('   Auth:', req.headers.authorization ? 'present' : 'none');
  next();
});

/* =========================
   ROUTES
========================= */
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Infinos Backend is running 🚀',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.use('/device', require('./routes/Device'));
app.use('/auth', require('./routes/auth'));
app.use('/testAPI', require('./routes/testAPI'));

/* =========================
   404 HANDLER
========================= */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

/* =========================
   START SERVER (ONCE)
========================= */
app.listen(PORT, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 INFINOS Backend Server Started');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(60));

  try {
    await deviceSimulator.initializeAllSimulations();
    console.log('✅ Device simulator ready\n');
  } catch (err) {
    console.error('❌ Simulator init failed:', err);
  }
});

/* =========================
   GRACEFUL SHUTDOWN
========================= */
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n🛑 Shutting down...');
  deviceSimulator.stopAllSimulations();
  process.exit(0);
}