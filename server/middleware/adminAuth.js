const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

function getAdminPassword() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD.trim()) {
      throw new Error('ADMIN_PASSWORD environment variable is not configured in production mode');
    }
    return process.env.ADMIN_PASSWORD;
  }
  return process.env.ADMIN_PASSWORD || 'admin123';
}

function verifyAdminPassword(password) {
  if (!password || typeof password !== 'string') return false;
  try {
    const expected = Buffer.from(getAdminPassword());
    const actual = Buffer.from(password);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isBankSettingsLocked() {
  return process.env.LOCK_BANK_SETTINGS === 'true' || process.env.LOCK_BANK_SETTINGS === '1';
}

const { logSecurityEvent } = require('../utils/securityLogger');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts from this IP address. Please try again in 15 minutes.'
  },
  handler: (req, res, next, options) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', req, 'admin login');
    res.status(429).json(options.message);
  }
});

/**
 * Middleware to check if the user is authenticated as admin via session
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

const { generateCsrfToken } = require('./csrf');

/**
 * Login handler — validates password with timing-safe comparison and regenerates session
 */
function login(req, res) {
  const { password } = req.body;
  if (!password) {
    logSecurityEvent('FAILED_ADMIN_LOGIN', req, 'missing password');
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  // Finding 8: Constant-time comparison using crypto.timingSafeEqual
  const match = verifyAdminPassword(password);

  if (match) {
    loginLimiter.resetKey(req.ip);
    // Finding 4: Regenerate session ID to prevent session fixation
    return req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Failed to initialize session' });
      }
      req.session.isAdmin = true;
      const csrfToken = generateCsrfToken(req, res);
      return req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ success: false, error: 'Failed to save session' });
        }
        return res.json({ success: true, csrfToken });
      });
    });
  }

  logSecurityEvent('FAILED_ADMIN_LOGIN', req, 'invalid password');
  return res.status(401).json({ success: false, error: 'Incorrect password' });
}

/**
 * Logout handler — destroys session
 */
function logout(req, res) {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.clearCookie('csrf_token');
    return res.json({ success: true });
  });
}

module.exports = {
  requireAdmin,
  login,
  logout,
  loginLimiter,
  verifyAdminPassword,
  isBankSettingsLocked,
  getAdminPassword
};
