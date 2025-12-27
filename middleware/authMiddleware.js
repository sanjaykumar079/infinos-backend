const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdmtxbmhsdHNkcnVmY3lvdWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Mzc1NDUsImV4cCI6MjA4MDMxMzU0NX0.Sq4NaZo1kSTM6yTS9wWPGGlgBpps7ycErdA-u6_rDgo";

// Client for verifying user tokens (uses anon key)
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

// Client for database operations (uses service role key)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Middleware to verify JWT token from Supabase
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No authentication token provided' 
      });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token' 
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      metadata: user.user_metadata,
      role: user.role,
    };

    // Add admin supabase client for database operations
    req.supabase = supabaseAdmin;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Authentication verification failed' 
    });
  }
};

const verifyAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Authentication required' 
    });
  }

  const isAdmin = req.user.metadata?.role === 'admin' || req.user.role === 'admin';

  if (!isAdmin) {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Admin privileges required' 
    });
  }

  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email,
          metadata: user.user_metadata,
          role: user.role,
        };
      }
    }

    // Always add admin client for database operations
    req.supabase = supabaseAdmin;

    next();
  } catch (error) {
    req.supabase = supabaseAdmin;
    next();
  }
};

const rateLimitByUser = (maxRequests = 100, windowMs = 60000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userData = userRequests.get(userId);

    if (now > userData.resetTime) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (userData.count >= maxRequests) {
      return res.status(429).json({ 
        error: 'Too many requests', 
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((userData.resetTime - now) / 1000)
      });
    }

    userData.count++;
    next();
  };
};

module.exports = {
  verifyToken,
  verifyAdmin,
  optionalAuth,
  rateLimitByUser,
};