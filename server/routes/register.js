const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../db');
const { isValidImage, getImageMimeType, ALLOWED_IMAGE_EXTENSIONS } = require('../utils/fileValidation');
const { logSecurityEvent } = require('../utils/securityLogger');

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 8, // max 8 submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many registration attempts from this IP address. Please try again later.'
  },
  handler: (req, res, next, options) => {
    logSecurityEvent('RATE_LIMIT_EXCEEDED', req, 'registration');
    res.status(429).json(options.message);
  }
});

// Configure multer for screenshot uploads (Finding 2 & 5)
const screenshotStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'data', 'uploads', 'screenshots'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? ext : '.png';
    const randomId = crypto.randomBytes(16).toString('hex');
    cb(null, `scr_${Date.now()}_${randomId}${safeExt}`);
  }
});

const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

/**
 * Helper: read the currently active fee tier from settings
 */
function getActivePricing() {
  const enabledRow = db.prepare("SELECT value FROM settings WHERE key = 'early_bird_enabled'").get();
  const earlyBirdEnabled = enabledRow && enabledRow.value === '1';

  const earlyRow = db.prepare("SELECT value FROM settings WHERE key = 'early_bird_fee'").get();
  const regularRow = db.prepare("SELECT value FROM settings WHERE key = 'regular_fee'").get();

  const earlyBirdFee = earlyRow && earlyRow.value ? parseInt(earlyRow.value, 10) : 299;
  const regularFee = regularRow && regularRow.value ? parseInt(regularRow.value, 10) : 499;

  if (earlyBirdEnabled) {
    return { fee: earlyBirdFee, tier: 'early_bird' };
  }
  return { fee: regularFee, tier: 'regular' };
}

// POST /api/register
router.post('/api/register', registerLimiter, (req, res, next) => {
  uploadScreenshot.single('screenshot')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        logSecurityEvent('REJECTED_UPLOAD', req, 'file size limit exceeded (5MB limit)');
        return res.status(400).json({ success: false, error: 'Payment screenshot exceeds the 5MB size limit' });
      }
      logSecurityEvent('REJECTED_UPLOAD', req, err.message || 'invalid upload');
      return res.status(400).json({ success: false, error: err.message || 'Error uploading file' });
    }
    next();
  });
}, (req, res) => {
  try {
    const { name, email, phone, institution, utr_number } = req.body;

    // Validate required fields
    const missing = [];
    if (!name || !name.trim()) missing.push('name');
    if (!email || !email.trim()) missing.push('email');
    if (!phone || !phone.trim()) missing.push('phone');
    if (!institution || !institution.trim()) missing.push('institution');
    if (!utr_number || !utr_number.trim()) missing.push('utr_number');

    if (missing.length > 0) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
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

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedInstitution = institution.trim();
    const trimmedUtr = utr_number.trim();

    // Finding 10: Server-side length caps and format checks
    if (trimmedName.length > 100) {
      if (req.file && fs.existsSync(req.file.path)) try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, error: 'Full name must not exceed 100 characters' });
    }

    if (trimmedInstitution.length > 150) {
      if (req.file && fs.existsSync(req.file.path)) try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, error: 'Institution name must not exceed 150 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (trimmedEmail.length > 100 || !emailRegex.test(trimmedEmail)) {
      if (req.file && fs.existsSync(req.file.path)) try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }

    const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
    if (trimmedPhone.length > 20 || !phoneRegex.test(trimmedPhone)) {
      if (req.file && fs.existsSync(req.file.path)) try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, error: 'Please enter a valid phone number (max 20 characters)' });
    }

    // Validate UTR: exactly 12 digits
    if (!/^\d{12}$/.test(trimmedUtr)) {
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(400).json({
        success: false,
        error: 'UTR number must be exactly 12 digits (numeric only)'
      });
    }

    // Finding 6: Reject duplicate / replayed UTR numbers
    const existingRow = db.prepare('SELECT id FROM registrations WHERE utr_number = ?').get(trimmedUtr);
    if (existingRow) {
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(400).json({
        success: false,
        error: 'This UTR number has already been registered'
      });
    }

    // Validate true file magic bytes (must be PNG or JPEG)
    if (!isValidImage(req.file.path)) {
      if (fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      logSecurityEvent('REJECTED_UPLOAD', req, `magic byte validation failed (declared mimetype: ${req.file.mimetype})`);
      return res.status(400).json({
        success: false,
        error: 'Uploaded file is not a valid image. Only PNG and JPEG images are allowed.'
      });
    }

    // Determine active fee tier at time of submission
    const { tier } = getActivePricing();

    const screenshotPath = req.file.filename;

    const stmt = db.prepare(`
      INSERT INTO registrations (name, email, phone, institution, utr_number, fee_tier, screenshot_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      trimmedName,
      trimmedEmail,
      trimmedPhone,
      trimmedInstitution,
      trimmedUtr,
      tier,
      screenshotPath
    );

    return res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE constraint failed')))) {
      return res.status(400).json({ success: false, error: 'This UTR number has already been registered' });
    }
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// GET /api/settings/fee (public — shown on registration form)
router.get('/api/settings/fee', (req, res) => {
  try {
    const pricing = getActivePricing();
    return res.json(pricing);
  } catch (err) {
    console.error('Error fetching fee:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
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

// GET /api/settings/event (public — event info)
router.get('/api/settings/event', (req, res) => {
  try {
    const fields = ['event_date', 'event_venue'];
    const eventInfo = {};
    fields.forEach(field => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(field);
      eventInfo[field] = row ? row.value : '';
    });
    return res.json(eventInfo);
  } catch (err) {
    console.error('Error fetching event settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/settings/payment (public — display mode & qr image url)
router.get('/api/settings/payment', (req, res) => {
  try {
    const modeRow = db.prepare("SELECT value FROM settings WHERE key = 'payment_display_mode'").get();
    const qrRow = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();

    const mode = modeRow && modeRow.value ? modeRow.value : 'bank';
    const hasQr = !!(qrRow && qrRow.value && qrRow.value.trim());

    return res.json({
      payment_display_mode: mode,
      qr_image_url: hasQr ? '/api/payment/qr' : null
    });
  } catch (err) {
    console.error('Error fetching payment settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/payment/qr (public — streams ONLY the currently active QR image)
router.get('/api/payment/qr', (req, res) => {
  try {
    // Explicitly disallow any custom filename parameter or query attempt
    if (req.params.filename || req.query.filename) {
      return res.status(400).json({ success: false, error: 'Custom filename parameters are not allowed' });
    }

    const row = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();
    if (!row || !row.value || !row.value.trim()) {
      return res.status(404).json({ success: false, error: 'No active QR code configured' });
    }

    const filename = row.value.trim();
    const qrDir = path.resolve(__dirname, '..', 'data', 'uploads', 'qr');
    const resolvedPath = path.resolve(qrDir, filename);

    // Defensive check to ensure resolved path is inside uploads/qr directory
    if (!resolvedPath.startsWith(qrDir + path.sep)) {
      return res.status(400).json({ success: false, error: 'Access denied' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: 'QR code file not found' });
    }

    const mimeType = getImageMimeType(resolvedPath);
    if (!mimeType) {
      return res.status(400).json({ success: false, error: 'Invalid QR image format' });
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="qr${mimeType === 'image/jpeg' ? '.jpg' : '.png'}"`);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.sendFile(resolvedPath);
  } catch (err) {
    console.error('Error serving QR image:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
