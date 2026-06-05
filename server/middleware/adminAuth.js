const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

/**
 * Middleware to check if the user is authenticated as admin via session
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

/**
 * Login handler — validates password and sets session
 */
function login(req, res) {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
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
    return res.json({ success: true });
  });
}

module.exports = { requireAdmin, login, logout };
