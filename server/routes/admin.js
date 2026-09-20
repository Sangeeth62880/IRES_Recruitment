const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { requireAdmin, logout } = require('../middleware/adminAuth');
const { verifyCsrf, generateCsrfToken } = require('../middleware/csrf');
const { isValidImage, getImageMimeType, ALLOWED_IMAGE_EXTENSIONS } = require('../utils/fileValidation');
const { logSecurityEvent } = require('../utils/securityLogger');

const router = express.Router();

// Multer storage for QR code uploads (Finding 2)
const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'data', 'uploads', 'qr'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? ext : '.png';
    const timestamp = Date.now();
    cb(null, `qr_${timestamp}${safeExt}`);
  }
});

const uploadQr = multer({
  storage: qrStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      return cb(new Error('Only PNG, JPG, and JPEG image files are allowed'));
    }
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// All admin routes require authentication and CSRF protection on mutating requests
router.use(requireAdmin);
router.use(verifyCsrf);

// POST /api/admin/logout (Finding 7: Moved inside adminRoutes to enforce requireAdmin & verifyCsrf)
router.post('/logout', logout);

// GET /api/admin/csrf-token (Retrieve or generate CSRF token for active admin session)
router.get('/csrf-token', (req, res) => {
  let token = req.session && req.session.csrfToken;
  if (!token) {
    token = generateCsrfToken(req, res);
  }
  return res.json({ csrfToken: token });
});

// GET /api/admin/registrations
router.get('/registrations', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM registrations ORDER BY submitted_at DESC').all();
    const result = rows.map(row => ({
      ...row,
      verified: !!row.verified,
      flagged: !!row.flagged,
      payment_status: row.payment_status || null,
      screenshot_url: row.screenshot_path ? `/api/admin/screenshots/${row.screenshot_path}` : null
    }));
    return res.json(result);
  } catch (err) {
    console.error('Error fetching registrations:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/screenshots/:filename (Finding 2: Authenticated, traversal-protected, safe Content-Type)
router.get('/screenshots/:filename', (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename parameter:
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    // Reject path separators, null bytes, or directory traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.includes('\0')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }

    // Safe pattern: alphanumeric, dot, underscore, dash
    const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
    if (!SAFE_FILENAME_REGEX.test(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename format' });
    }

    const screenshotsDir = path.resolve(__dirname, '..', 'data', 'uploads', 'screenshots');
    const resolvedPath = path.resolve(screenshotsDir, filename);

    // Verify resolved path strictly resides within screenshots directory
    if (!resolvedPath.startsWith(screenshotsDir + path.sep)) {
      return res.status(400).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: 'Screenshot not found' });
    }

    const mimeType = getImageMimeType(resolvedPath);
    if (!mimeType) {
      return res.status(400).json({ success: false, error: 'Invalid image format' });
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="screenshot${mimeType === 'image/jpeg' ? '.jpg' : '.png'}"`);
    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Error streaming screenshot:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/registrations/:id/verify
router.patch('/registrations/:id/verify', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE registrations SET verified = 1 WHERE id = ?').run(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/registrations/:id/unverify
router.patch('/registrations/:id/unverify', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE registrations SET verified = 0 WHERE id = ?').run(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/admin/registrations/:id
router.delete('/registrations/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Get screenshot_path to delete file
    const row = db.prepare('SELECT screenshot_path FROM registrations WHERE id = ?').get(id);
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);

    if (row && row.screenshot_path) {
      const filePath = path.join(__dirname, '..', 'data', 'uploads', 'screenshots', row.screenshot_path);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/export/csv
router.get('/export/csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM registrations ORDER BY submitted_at DESC').all();

    const headers = ['id', 'name', 'email', 'phone', 'institution', 'utr_number', 'fee_tier', 'verified', 'payment_status', 'submitted_at'];
    const csvRows = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map(h => {
        let val = row[h];
        if (h === 'verified') val = val ? 'Yes' : 'No';
        if (val === null || val === undefined) val = '';
        val = String(val);

        // Finding 3: Neutralize spreadsheet formula injection triggers (=, +, -, @, tab, CR)
        if (/^[=+\-@\t\r]/.test(val)) {
          val = `'${val}`;
        }

        // Escape commas and quotes in CSV values
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvRows.push(values.join(','));
    }

    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/settings/pricing
router.get('/settings/pricing', (req, res) => {
  try {
    const earlyRow = db.prepare("SELECT value FROM settings WHERE key = 'early_bird_fee'").get();
    const regularRow = db.prepare("SELECT value FROM settings WHERE key = 'regular_fee'").get();
    const enabledRow = db.prepare("SELECT value FROM settings WHERE key = 'early_bird_enabled'").get();

    return res.json({
      early_bird_fee: earlyRow ? parseInt(earlyRow.value, 10) || 0 : 0,
      regular_fee: regularRow ? parseInt(regularRow.value, 10) || 0 : 0,
      early_bird_enabled: enabledRow ? enabledRow.value === '1' : false
    });
  } catch (err) {
    console.error('Error fetching pricing:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/admin/settings/pricing
router.post('/settings/pricing', (req, res) => {
  try {
    const { early_bird_fee, regular_fee, early_bird_enabled } = req.body;

    if (early_bird_fee !== undefined && early_bird_fee !== null) {
      const val = parseInt(early_bird_fee, 10);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ success: false, error: 'Valid early bird fee amount is required' });
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('early_bird_fee', ?)").run(String(val));
    }

    if (regular_fee !== undefined && regular_fee !== null) {
      const val = parseInt(regular_fee, 10);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ success: false, error: 'Valid regular fee amount is required' });
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('regular_fee', ?)").run(String(val));
    }

    if (early_bird_enabled !== undefined) {
      const val = early_bird_enabled ? '1' : '0';
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('early_bird_enabled', ?)").run(val);
    }

    // Return current state
    const earlyRow = db.prepare("SELECT value FROM settings WHERE key = 'early_bird_fee'").get();
    const regularRow = db.prepare("SELECT value FROM settings WHERE key = 'regular_fee'").get();
    const enabledRow = db.prepare("SELECT value FROM settings WHERE key = 'early_bird_enabled'").get();

    return res.json({
      success: true,
      early_bird_fee: earlyRow ? parseInt(earlyRow.value, 10) : 0,
      regular_fee: regularRow ? parseInt(regularRow.value, 10) : 0,
      early_bird_enabled: enabledRow ? enabledRow.value === '1' : false
    });
  } catch (err) {
    console.error('Pricing update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/settings/event
router.patch('/settings/event', (req, res) => {
  try {
    const { event_date, event_venue } = req.body;

    const updates = {};
    if (event_date !== undefined) {
      updates.event_date = typeof event_date === 'string' ? event_date.trim() : '';
    }
    if (event_venue !== undefined) {
      updates.event_venue = typeof event_venue === 'string' ? event_venue.trim() : '';
    }

    db.transaction(() => {
      Object.entries(updates).forEach(([key, value]) => {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
      });
    })();

    return res.json({ success: true, event_details: updates });
  } catch (err) {
    console.error('Event settings update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/settings/bank
router.patch('/settings/bank', (req, res) => {
  try {
    const { bank_name, account_holder, account_number, ifsc_code, branch_name } = req.body;

    const bankNameVal = typeof bank_name === 'string' ? bank_name.trim() : '';
    const accountHolderVal = typeof account_holder === 'string' ? account_holder.trim() : '';
    const accountNumberVal = typeof account_number === 'string' ? account_number.trim() : '';
    const ifscCodeVal = typeof ifsc_code === 'string' ? ifsc_code.trim() : '';
    const branchNameVal = typeof branch_name === 'string' ? branch_name.trim() : '';

    // Validate if non-empty
    if (bankNameVal && bankNameVal.length > 100) {
      return res.status(400).json({ success: false, error: 'Bank name must be at most 100 characters' });
    }
    if (accountHolderVal && accountHolderVal.length > 100) {
      return res.status(400).json({ success: false, error: 'Account holder must be at most 100 characters' });
    }
    if (accountNumberVal && !/^\d{9,18}$/.test(accountNumberVal)) {
      return res.status(400).json({ success: false, error: 'Account number must be numeric, 9-18 digits' });
    }
    if (ifscCodeVal && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCodeVal)) {
      return res.status(400).json({ success: false, error: 'IFSC code must match standard format (e.g. FDRL0001234)' });
    }
    if (branchNameVal && branchNameVal.length > 100) {
      return res.status(400).json({ success: false, error: 'Branch name must be at most 100 characters' });
    }

    // Save to settings table
    const updates = {
      bank_name: bankNameVal,
      account_holder: accountHolderVal,
      account_number: accountNumberVal,
      ifsc_code: ifscCodeVal,
      branch_name: branchNameVal
    };

    db.transaction(() => {
      Object.entries(updates).forEach(([key, value]) => {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
      });
    })();

    return res.json({ success: true, bank_details: updates });
  } catch (err) {
    console.error('Bank settings update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/settings/payment
router.get('/settings/payment', (req, res) => {
  try {
    const modeRow = db.prepare("SELECT value FROM settings WHERE key = 'payment_display_mode'").get();
    const qrRow = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();

    const mode = modeRow && modeRow.value ? modeRow.value : 'bank';
    const qrFilename = qrRow && qrRow.value && qrRow.value.trim() ? qrRow.value.trim() : null;

    return res.json({
      payment_display_mode: mode,
      qr_image_filename: qrFilename,
      qr_image_url: qrFilename ? '/api/payment/qr' : null
    });
  } catch (err) {
    console.error('Error fetching admin payment settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/settings/payment-mode
router.patch('/settings/payment-mode', (req, res) => {
  try {
    const { payment_display_mode } = req.body;
    const allowed = ['qr', 'bank', 'both'];

    if (!payment_display_mode || !allowed.includes(payment_display_mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid payment display mode. Allowed values: ${allowed.join(', ')}`
      });
    }

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('payment_display_mode', ?)").run(payment_display_mode);

    return res.json({ success: true, payment_display_mode });
  } catch (err) {
    console.error('Error updating payment display mode:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/admin/settings/qr
router.post('/settings/qr', (req, res, next) => {
  uploadQr.single('qr_image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        logSecurityEvent('REJECTED_UPLOAD', req, 'QR file size limit exceeded (2MB)');
        return res.status(400).json({ success: false, error: 'QR image exceeds the 2MB size limit' });
      }
      logSecurityEvent('REJECTED_UPLOAD', req, err.message || 'invalid QR upload');
      return res.status(400).json({ success: false, error: err.message || 'Error uploading QR image' });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'QR image file is required' });
    }

    // Validate true magic bytes (PNG or JPEG)
    if (!isValidImage(req.file.path)) {
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      logSecurityEvent('REJECTED_UPLOAD', req, `QR magic byte validation failed (declared: ${req.file.mimetype})`);
      return res.status(400).json({
        success: false,
        error: 'Uploaded file is not a valid image. Only PNG and JPEG images are allowed.'
      });
    }

    const newFilename = req.file.filename;

    // Retrieve previous filename from settings
    const prevRow = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();
    const prevFilename = prevRow && prevRow.value ? prevRow.value.trim() : null;

    // Transaction to update settings and write audit log
    db.transaction(() => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('qr_image_filename', ?)").run(newFilename);
      db.prepare(`
        INSERT INTO qr_audit_log (changed_at, ip_address, previous_filename, new_filename)
        VALUES (datetime('now', 'localtime'), ?, ?, ?)
      `).run(req.ip || 'unknown', prevFilename, newFilename);
    })();

    // Finding 11: Cleanup previous QR file from disk if replaced and different
    if (prevFilename && prevFilename !== newFilename) {
      const qrDir = path.resolve(__dirname, '..', 'data', 'uploads', 'qr');
      const oldFilePath = path.resolve(qrDir, prevFilename);
      if (oldFilePath.startsWith(qrDir + path.sep) && fs.existsSync(oldFilePath)) {
        try { fs.unlinkSync(oldFilePath); } catch (_) {}
      }
    }

    return res.json({
      success: true,
      qr_image_filename: newFilename,
      qr_image_url: '/api/payment/qr'
    });
  } catch (err) {
    console.error('Error processing QR upload:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/admin/settings/qr
router.delete('/settings/qr', (req, res) => {
  try {
    const prevRow = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();
    const prevFilename = prevRow && prevRow.value ? prevRow.value.trim() : null;

    if (!prevFilename) {
      return res.status(400).json({ success: false, error: 'No active QR code to remove' });
    }

    db.transaction(() => {
      db.prepare("DELETE FROM settings WHERE key = 'qr_image_filename'").run();
      db.prepare(`
        INSERT INTO qr_audit_log (changed_at, ip_address, previous_filename, new_filename)
        VALUES (datetime('now', 'localtime'), ?, ?, NULL)
      `).run(req.ip || 'unknown', prevFilename);
    })();

    // Remove file from disk
    const qrDir = path.resolve(__dirname, '..', 'data', 'uploads', 'qr');
    const filePath = path.resolve(qrDir, prevFilename);
    if (filePath.startsWith(qrDir + path.sep) && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting QR:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
