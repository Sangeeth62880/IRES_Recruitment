const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { VALID_TEAMS, TEAM_LABELS } = require('../../shared/constants.json');

const router = express.Router();
const VALID_DISPLAY_NAMES = Object.values(TEAM_LABELS);

// Configure multer for screenshot uploads
const screenshotStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'data', 'uploads', 'screenshots'));
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
    const { name, department, year, team_selected, utr_number } = req.body;

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

    // Server-side validation for team_selected
    if (team_selected && !VALID_DISPLAY_NAMES.includes(team_selected.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid team selected'
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
      team_selected ? team_selected.trim() : 'General', // default value for team_selected
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

// GET /api/settings/fee (public — shown on registration form)
router.get('/api/settings/fee', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_fee'").get();
  const fee = row && row.value ? parseInt(row.value, 10) : 349;
  return res.json({ fee });
});

// GET /api/settings/bank (public — shown on registration form if populated)
router.get('/api/settings/bank', (req, res) => {
  try {
    const fields = ['bank_name', 'account_holder', 'account_number', 'ifsc_code', 'branch_name'];
    const bankDetails = {};
    fields.forEach(field => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(field);
      bankDetails[field] = row ? row.value : '';
    });
    return res.json(bankDetails);
  } catch (err) {
    console.error('Error fetching bank settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/register/verify-team (public — checks unique team URL slug)
router.get('/api/register/verify-team', (req, res) => {
  try {
    const { slug } = req.query;
    if (!slug) {
      return res.json({ success: false, error: 'Missing slug' });
    }
    const row = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'team_slug_%' AND value = ?").get(slug);
    if (row) {
      const teamKey = row.key.replace('team_slug_', '');
      if (VALID_TEAMS.includes(teamKey)) {
        return res.json({
          success: true,
          team: teamKey,
          label: TEAM_LABELS[teamKey]
        });
      }
    }
    return res.json({ success: false, error: 'Invalid link' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
