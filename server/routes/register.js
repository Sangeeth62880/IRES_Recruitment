const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');

const router = express.Router();

// Configure multer for screenshot uploads
const screenshotStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'screenshots'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const utr = req.body.utr_number || 'unknown';
    const timestamp = Date.now();
    cb(null, `${utr}_${timestamp}${ext}`);
  }
});

const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST /api/register
router.post('/api/register', (req, res, next) => {
  uploadScreenshot.single('screenshot')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Payment screenshot exceeds the 5MB size limit' });
      }
      return res.status(400).json({ success: false, error: err.message || 'Error uploading file' });
    }
    next();
  });
}, (req, res) => {
  try {
    const { name, department, year, utr_number } = req.body;

    // Validate required fields
    const missing = [];
    if (!name || !name.trim()) missing.push('name');
    if (!department || !department.trim()) missing.push('department');
    if (!year || !year.trim()) missing.push('year');
    if (!utr_number || !utr_number.trim()) missing.push('utr_number');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    // Enforce screenshot is not optional
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Payment screenshot is required'
      });
    }

    // Validate UTR: exactly 12 digits
    if (!/^\d{12}$/.test(utr_number.trim())) {
      return res.status(400).json({
        success: false,
        error: 'UTR number must be exactly 12 digits (numeric only)'
      });
    }

    const screenshotPath = req.file.filename;

    const stmt = db.prepare(`
      INSERT INTO registrations (name, department, year, team_selected, email, phone, utr_number, screenshot_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      name.trim(),
      department.trim(),
      year.trim(),
      'General', // default value for team_selected
      null,      // email
      null,      // phone
      utr_number.trim(),
      screenshotPath
    );

    return res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// GET /api/settings/qr
router.get('/api/settings/qr', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'qr_path'").get();
  if (row && row.value) {
    return res.json({ qr_url: `/uploads/qr/${row.value}` });
  }
  return res.json({ qr_url: null });
});

// GET /api/settings/fee (public — shown on registration form)
router.get('/api/settings/fee', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_fee'").get();
  const fee = row && row.value ? parseInt(row.value, 10) : 349;
  return res.json({ fee });
});

module.exports = router;
