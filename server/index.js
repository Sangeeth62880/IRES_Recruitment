require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const screenshotsDir = path.join(uploadsDir, 'screenshots');
const qrDir = path.join(uploadsDir, 'qr');
const tempDir = path.join(uploadsDir, 'temp');

[uploadsDir, screenshotsDir, qrDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set to true in production with HTTPS
    maxAge: 1000 * 60 * 60 * 4 // 4 hours
  }
}));

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Routes
const registerRoutes = require('./routes/register');
const adminRoutes = require('./routes/admin');
const { login, logout } = require('./middleware/adminAuth');

app.use(registerRoutes);

// Admin auth endpoints (not protected by requireAdmin)
app.post('/api/admin/login', login);
app.post('/api/admin/logout', logout);

// Protected admin routes
app.use('/api/admin', adminRoutes);

// Verification routes (also admin-protected)
const verifyRoutes = require('./routes/verify');
app.use('/api/admin', verifyRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
