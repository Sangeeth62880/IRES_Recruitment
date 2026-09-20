const express = require('express');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const supabase = require('../supabaseClient');
const { isValidImageBuffer, getImageMimeTypeFromBuffer, ALLOWED_IMAGE_EXTENSIONS } = require('../utils/fileValidation');
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

// Configure multer for screenshot uploads — memoryStorage for Supabase Storage (Finding 2 & 5)
const uploadScreenshot = multer({
  storage: multer.memoryStorage(),
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
async function getActivePricing() {
  const { data: enabledRow } = await supabase
    .from('settings').select('value').eq('key', 'early_bird_enabled').maybeSingle();
  const earlyBirdEnabled = enabledRow && enabledRow.value === '1';

  const { data: earlyRow } = await supabase
    .from('settings').select('value').eq('key', 'early_bird_fee').maybeSingle();
  const { data: regularRow } = await supabase
    .from('settings').select('value').eq('key', 'regular_fee').maybeSingle();

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
}, async (req, res) => {
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
      return res.status(400).json({ success: false, error: 'Full name must not exceed 100 characters' });
    }

    if (trimmedInstitution.length > 150) {
      return res.status(400).json({ success: false, error: 'Institution name must not exceed 150 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (trimmedEmail.length > 100 || !emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }

    const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
    if (trimmedPhone.length > 20 || !phoneRegex.test(trimmedPhone)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid phone number (max 20 characters)' });
    }

    // Validate UTR: exactly 12 digits
    if (!/^\d{12}$/.test(trimmedUtr)) {
      return res.status(400).json({
        success: false,
        error: 'UTR number must be exactly 12 digits (numeric only)'
      });
    }

    // Finding 6: Reject duplicate / replayed UTR numbers (app-level pre-insert check)
    const { data: existingRow } = await supabase
      .from('registrations').select('id').eq('utr_number', trimmedUtr).maybeSingle();
    if (existingRow) {
      return res.status(400).json({
        success: false,
        error: 'This UTR number has already been registered'
      });
    }

    // Validate true file magic bytes (must be PNG or JPEG) — buffer-based
    const verifiedMimeType = getImageMimeTypeFromBuffer(req.file.buffer);
    if (!verifiedMimeType) {
      logSecurityEvent('REJECTED_UPLOAD', req, `magic byte validation failed (declared mimetype: ${req.file.mimetype})`);
      return res.status(400).json({
        success: false,
        error: 'Uploaded file is not a valid image. Only PNG and JPEG images are allowed.'
      });
    }

    // Determine active fee tier at time of submission
    const { tier } = await getActivePricing();

    // Finding 5: Random-identifier filename generation (crypto.randomBytes-based)
    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? ext : '.png';
    const randomId = crypto.randomBytes(16).toString('hex');
    const storageKey = `scr_${Date.now()}_${randomId}${safeExt}`;

    // Upload to Supabase Storage using verified MIME type (not client-declared)
    const { error: uploadError } = await supabase.storage
      .from('payment-screenshots')
      .upload(storageKey, req.file.buffer, {
        contentType: verifiedMimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return res.status(500).json({ success: false, error: 'Server error during file upload' });
    }

    // Insert registration into Postgres
    const { data: insertData, error: insertError } = await supabase
      .from('registrations')
      .insert({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        institution: trimmedInstitution,
        utr_number: trimmedUtr,
        fee_tier: tier,
        screenshot_storage_path: storageKey
      })
      .select('id')
      .single();

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from('payment-screenshots').remove([storageKey]);

      // Finding 6: DB-level UNIQUE constraint catch
      if (insertError.code === '23505') { // unique_violation
        return res.status(400).json({ success: false, error: 'This UTR number has already been registered' });
      }
      console.error('Registration error:', insertError);
      return res.status(500).json({ success: false, error: 'Server error during registration' });
    }

    return res.json({ success: true, id: insertData.id });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: 'Server error during registration' });
  }
});

// GET /api/settings/fee (public — shown on registration form)
router.get('/api/settings/fee', async (req, res) => {
  try {
    const pricing = await getActivePricing();
    return res.json(pricing);
  } catch (err) {
    console.error('Error fetching fee:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/settings/bank (public — shown on registration form if populated)
router.get('/api/settings/bank', async (req, res) => {
  try {
    const fields = ['bank_name', 'account_holder', 'account_number', 'ifsc_code', 'branch_name'];
    const bankDetails = {};

    const { data: rows } = await supabase
      .from('settings').select('key, value').in('key', fields);

    // Initialize all fields to empty string
    fields.forEach(field => { bankDetails[field] = ''; });
    // Populate from query results
    if (rows) {
      rows.forEach(row => { bankDetails[row.key] = row.value || ''; });
    }

    return res.json(bankDetails);
  } catch (err) {
    console.error('Error fetching bank settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/settings/event (public — event info)
router.get('/api/settings/event', async (req, res) => {
  try {
    const fields = ['event_date', 'event_venue'];
    const eventInfo = {};

    const { data: rows } = await supabase
      .from('settings').select('key, value').in('key', fields);

    fields.forEach(field => { eventInfo[field] = ''; });
    if (rows) {
      rows.forEach(row => { eventInfo[row.key] = row.value || ''; });
    }

    return res.json(eventInfo);
  } catch (err) {
    console.error('Error fetching event settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/settings/payment (public — display mode & qr image url)
router.get('/api/settings/payment', async (req, res) => {
  try {
    const { data: modeRow } = await supabase
      .from('settings').select('value').eq('key', 'payment_display_mode').maybeSingle();
    const { data: qrRow } = await supabase
      .from('settings').select('value').eq('key', 'qr_storage_path').maybeSingle();

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

// GET /api/payment/qr (public — proxies ONLY the currently active QR image from Supabase Storage)
router.get('/api/payment/qr', async (req, res) => {
  try {
    // Explicitly disallow any custom filename parameter or query attempt
    if (req.params.filename || req.query.filename) {
      return res.status(400).json({ success: false, error: 'Custom filename parameters are not allowed' });
    }

    const { data: row } = await supabase
      .from('settings').select('value').eq('key', 'qr_storage_path').maybeSingle();
    if (!row || !row.value || !row.value.trim()) {
      return res.status(404).json({ success: false, error: 'No active QR code configured' });
    }

    const storagePath = row.value.trim();

    // Download the QR image from Supabase Storage and proxy it through the backend
    // (preserves Content-Type/nosniff headers, avoids exposing signed URLs to public)
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('qr-codes')
      .download(storagePath);

    if (downloadError || !fileData) {
      return res.status(404).json({ success: false, error: 'QR code file not found' });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const mimeType = getImageMimeTypeFromBuffer(buffer);
    if (!mimeType) {
      return res.status(400).json({ success: false, error: 'Invalid QR image format' });
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', `inline; filename="qr${mimeType === 'image/jpeg' ? '.jpg' : '.png'}"`);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.send(buffer);
  } catch (err) {
    console.error('Error serving QR image:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
