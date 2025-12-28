// infinosbackend/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const deviceSimulator = require('./services/deviceSimulator');
const supabase = require('./config/supabase');

const app = express();

/* =========================
   PORT (FIXED)
========================= */
// const PORT = process.env.PORT || 8080;
app.listen(process.env.PORT)

/* =========================
   CORS (SINGLE SOURCE OF TRUTH)
========================= */
const corsOptions = {
  origin: 'https://main.d385jmcqgfjtrz.amplifyapp.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Admin-Passkey'
  ],
  optionsSuccessStatus: 200
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
  console.log('   Headers:', {
    auth: req.headers.authorization ? 'present' : 'none',
    admin: req.headers['x-admin-passkey'] ? 'present' : 'none',
  });
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
  const sims = deviceSimulator.getRunningSimulations();
  res.json({
    status: 'OK',
    port: PORT,
    activeSimulations: sims.length,
    supabaseConnected: !!process.env.SUPABASE_URL,
  });
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
   START SERVER (ONLY ONCE)
========================= */
app.listen(PORT, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 INFINOS Backend Server Started');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 CORS: ${corsOptions.origin}`);
  console.log('='.repeat(60));

  try {
    console.log('🔄 Initializing device simulator...');
    await deviceSimulator.initializeAllSimulations();
    console.log('✅ Device simulator ready\n');
  } catch (err) {
    console.error('❌ Simulator init failed:', err);
    // IMPORTANT: do NOT crash the server
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
