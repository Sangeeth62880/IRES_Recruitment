const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Boot guards ──────────────────────────────────────────────────────
// Enforce ADMIN_PASSWORD and SESSION_SECRET in production; permit fallback only in development
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD.trim()) {
    console.error('FATAL: ADMIN_PASSWORD environment variable is not set or empty in production mode. Refusing to start server.');
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim()) {
    console.error('FATAL: SESSION_SECRET environment variable is not set or empty in production mode. Refusing to start server.');
    process.exit(1);
  }
} else {
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: ADMIN_PASSWORD environment variable is unset. Using development fallback "admin123". NEVER use this fallback in production!');
  }
  if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET environment variable is unset. Using ephemeral development secret. NEVER use this fallback in production!');
  }
}

// Supabase boot guards are in supabaseClient.js (always enforced, not just production)
// SESSION_DB_URL is required for the Postgres session store
const sessionDbUrl = process.env.SESSION_DB_URL || process.env.DATABASE_URL;
if (!sessionDbUrl || !sessionDbUrl.trim()) {
  console.error('FATAL: SESSION_DB_URL environment variable is not set or empty. Refusing to start server.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');
const { Pool } = require('pg');
const pgSession = require('connect-pg-simple')(session);

// Initialize Supabase client (triggers its own boot guards)
require('./supabaseClient');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

const helmet = require('helmet');

// Middleware
app.use(helmet());
// CORS Configuration: explicit allowlist from ALLOWED_ORIGINS env var, dev fallback only
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173']);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, same-origin tools)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Postgres Session Store (connect-pg-simple) ──────────────────────
const sessionPool = new Pool({
  connectionString: sessionDbUrl,
});

sessionPool.on('error', (err) => {
  console.error('Unexpected error on idle session database client:', err.message);
});

const cookieSameSite = process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
const cookieSecure = process.env.NODE_ENV === 'production' || cookieSameSite === 'none';

app.use(session({
  store: new pgSession({
    pool: sessionPool,
    tableName: 'session',
    pruneSessionInterval: 60 * 60, // prune expired sessions every hour (seconds)
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    maxAge: 1000 * 60 * 60 * 4 // 4 hours
  }
}));

// Routes
const registerRoutes = require('./routes/register');
const adminRoutes = require('./routes/admin');
const { login, logout, loginLimiter } = require('./middleware/adminAuth');

app.use(registerRoutes);

// Admin auth endpoint (login is unauthenticated, logout is protected inside adminRoutes)
app.post('/api/admin/login', loginLimiter, login);

// Protected admin routes
app.use('/api/admin', adminRoutes);

// Serve static frontend files if built or in production
const clientDistDir = path.join(__dirname, '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' || fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
