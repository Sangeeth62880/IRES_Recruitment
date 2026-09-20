require('dotenv').config();

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

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');

const db = require('./db');
const SqliteSessionStore = require('./sessionStore');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'data', 'uploads');
const screenshotsDir = path.join(uploadsDir, 'screenshots');
const qrDir = path.join(uploadsDir, 'qr');
const tempDir = path.join(uploadsDir, 'temp');

[uploadsDir, screenshotsDir, qrDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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

// Session middleware
app.use(session({
  store: new SqliteSessionStore(db),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
    secure: process.env.NODE_ENV === 'production', // true in production with HTTPS, false in dev
    maxAge: 1000 * 60 * 60 * 4 // 4 hours
  }
}));

// Upload directories are accessed strictly through controlled endpoints:
// Screenshots: GET /api/admin/screenshots/:filename (authenticated)
// Active QR: GET /api/payment/qr (public active-only streamer)

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

