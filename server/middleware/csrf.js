const crypto = require('crypto');
const { logSecurityEvent } = require('../utils/securityLogger');

/**
 * Generates a cryptographically secure CSRF token, stores it in the session,
 * and sets a readable cookie so client scripts can access it.
 */
function generateCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  if (req.session) {
    req.session.csrfToken = token;
  }
  const cookieSameSite = process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
  const cookieSecure = process.env.NODE_ENV === 'production' || cookieSameSite === 'none';

  res.cookie('csrf_token', token, {
    httpOnly: false, // Readable by client JS for double-submit header
    sameSite: cookieSameSite,
    secure: cookieSecure,
    path: '/'
  });
  return token;
}

/**
 * Middleware to verify CSRF token on mutating requests (POST, PATCH, PUT, DELETE).
 * Compares X-CSRF-Token request header with token stored in the server session.
 */
function verifyCsrf(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const clientToken = req.headers['x-csrf-token'];
  const sessionToken = req.session && req.session.csrfToken;

  if (!clientToken || !sessionToken || clientToken !== sessionToken) {
    logSecurityEvent('CSRF_MISMATCH', req, `${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing CSRF token'
    });
  }

  next();
}

module.exports = { generateCsrfToken, verifyCsrf };
