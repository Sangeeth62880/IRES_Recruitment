const express = require('express');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const supabase = require('../supabaseClient');
const { requireAdmin, logout } = require('../middleware/adminAuth');
const { verifyCsrf, generateCsrfToken } = require('../middleware/csrf');
const { isValidImageBuffer, getImageMimeTypeFromBuffer, ALLOWED_IMAGE_EXTENSIONS } = require('../utils/fileValidation');
const { logSecurityEvent } = require('../utils/securityLogger');

const router = express.Router();

// Multer memoryStorage for QR code uploads (Finding 2)
const uploadQr = multer({
  storage: multer.memoryStorage(),
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
router.get('/registrations', async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('registrations')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const result = (rows || []).map(row => ({
      ...row,
      verified: !!row.verified,
      flagged: !!row.flagged,
      payment_status: row.payment_status || null,
      screenshot_url: row.screenshot_storage_path ? `/api/admin/screenshots/${row.screenshot_storage_path}` : null
    }));
    return res.json(result);
  } catch (err) {
    console.error('Error fetching registrations:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/screenshots/:filename (Finding 2: Authenticated, signed URL from Supabase Storage)
router.get('/screenshots/:filename', async (req, res) => {
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

    // Generate a short-lived signed URL (5 minutes) from Supabase Storage
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('payment-screenshots')
      .createSignedUrl(filename, 300); // 300 seconds = 5 minutes

    if (signedUrlError || !signedUrlData || !signedUrlData.signedUrl) {
      return res.status(404).json({ success: false, error: 'Screenshot not found' });
    }

    // Redirect authenticated admin to the signed URL
    return res.redirect(signedUrlData.signedUrl);
  } catch (err) {
    console.error('Error streaming screenshot:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/registrations/:id/verify
router.patch('/registrations/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('registrations')
      .update({ verified: true })
      .eq('id', parseInt(id, 10));
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/registrations/:id/unverify
router.patch('/registrations/:id/unverify', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('registrations')
      .update({ verified: false })
      .eq('id', parseInt(id, 10));
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/admin/registrations/:id
router.delete('/registrations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id, 10);

    // Get screenshot_storage_path to delete from Supabase Storage
    const { data: row } = await supabase
      .from('registrations')
      .select('screenshot_storage_path')
      .eq('id', parsedId)
      .maybeSingle();

    const { error: deleteError } = await supabase
      .from('registrations')
      .delete()
      .eq('id', parsedId);

    if (deleteError) throw deleteError;

    // Clean up screenshot from Supabase Storage
    if (row && row.screenshot_storage_path) {
      await supabase.storage
        .from('payment-screenshots')
        .remove([row.screenshot_storage_path]);
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/export/csv
router.get('/export/csv', async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('registrations')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const headers = ['id', 'name', 'email', 'phone', 'institution', 'utr_number', 'fee_tier', 'verified', 'payment_status', 'submitted_at'];
    const csvRows = [headers.join(',')];

    for (const row of (rows || [])) {
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
router.get('/settings/pricing', async (req, res) => {
  try {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['early_bird_fee', 'regular_fee', 'early_bird_enabled']);

    const settings = {};
    if (rows) rows.forEach(r => { settings[r.key] = r.value; });

    return res.json({
      early_bird_fee: settings.early_bird_fee ? parseInt(settings.early_bird_fee, 10) || 0 : 0,
      regular_fee: settings.regular_fee ? parseInt(settings.regular_fee, 10) || 0 : 0,
      early_bird_enabled: settings.early_bird_enabled ? settings.early_bird_enabled === '1' : false
    });
  } catch (err) {
    console.error('Error fetching pricing:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/admin/settings/pricing
router.post('/settings/pricing', async (req, res) => {
  try {
    const { early_bird_fee, regular_fee, early_bird_enabled } = req.body;

    if (early_bird_fee !== undefined && early_bird_fee !== null) {
      const val = parseInt(early_bird_fee, 10);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ success: false, error: 'Valid early bird fee amount is required' });
      }
      await supabase.from('settings').upsert({ key: 'early_bird_fee', value: String(val) }, { onConflict: 'key' });
    }

    if (regular_fee !== undefined && regular_fee !== null) {
      const val = parseInt(regular_fee, 10);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ success: false, error: 'Valid regular fee amount is required' });
      }
      await supabase.from('settings').upsert({ key: 'regular_fee', value: String(val) }, { onConflict: 'key' });
    }

    if (early_bird_enabled !== undefined) {
      const val = early_bird_enabled ? '1' : '0';
      await supabase.from('settings').upsert({ key: 'early_bird_enabled', value: val }, { onConflict: 'key' });
    }

    // Return current state
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['early_bird_fee', 'regular_fee', 'early_bird_enabled']);

    const settings = {};
    if (rows) rows.forEach(r => { settings[r.key] = r.value; });

    return res.json({
      success: true,
      early_bird_fee: settings.early_bird_fee ? parseInt(settings.early_bird_fee, 10) : 0,
      regular_fee: settings.regular_fee ? parseInt(settings.regular_fee, 10) : 0,
      early_bird_enabled: settings.early_bird_enabled ? settings.early_bird_enabled === '1' : false
    });
  } catch (err) {
    console.error('Pricing update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/settings/event
router.patch('/settings/event', async (req, res) => {
  try {
    const { event_date, event_venue } = req.body;

    const updates = {};
    if (event_date !== undefined) {
      updates.event_date = typeof event_date === 'string' ? event_date.trim() : '';
    }
    if (event_venue !== undefined) {
      updates.event_venue = typeof event_venue === 'string' ? event_venue.trim() : '';
    }

    for (const [key, value] of Object.entries(updates)) {
      await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
    }

    return res.json({ success: true, event_details: updates });
  } catch (err) {
    console.error('Event settings update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/settings/bank
router.patch('/settings/bank', async (req, res) => {
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

    for (const [key, value] of Object.entries(updates)) {
      await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
    }

    return res.json({ success: true, bank_details: updates });
  } catch (err) {
    console.error('Bank settings update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/settings/payment
router.get('/settings/payment', async (req, res) => {
  try {
    const { data: modeRow } = await supabase
      .from('settings').select('value').eq('key', 'payment_display_mode').maybeSingle();
    const { data: qrRow } = await supabase
      .from('settings').select('value').eq('key', 'qr_storage_path').maybeSingle();

    const mode = modeRow && modeRow.value ? modeRow.value : 'bank';
    const qrStoragePath = qrRow && qrRow.value && qrRow.value.trim() ? qrRow.value.trim() : null;

    return res.json({
      payment_display_mode: mode,
      qr_storage_path: qrStoragePath,
      qr_image_url: qrStoragePath ? '/api/payment/qr' : null
    });
  } catch (err) {
    console.error('Error fetching admin payment settings:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/settings/payment-mode
router.patch('/settings/payment-mode', async (req, res) => {
  try {
    const { payment_display_mode } = req.body;
    const allowed = ['qr', 'bank', 'both'];

    if (!payment_display_mode || !allowed.includes(payment_display_mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid payment display mode. Allowed values: ${allowed.join(', ')}`
      });
    }

    await supabase.from('settings').upsert(
      { key: 'payment_display_mode', value: payment_display_mode },
      { onConflict: 'key' }
    );

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
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'QR image file is required' });
    }

    // Validate true magic bytes (PNG or JPEG) — buffer-based
    const verifiedMimeType = getImageMimeTypeFromBuffer(req.file.buffer);
    if (!verifiedMimeType) {
      logSecurityEvent('REJECTED_UPLOAD', req, `QR magic byte validation failed (declared: ${req.file.mimetype})`);
      return res.status(400).json({
        success: false,
        error: 'Uploaded file is not a valid image. Only PNG and JPEG images are allowed.'
      });
    }

    // Generate storage key with safe extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXTENSIONS.includes(ext) ? ext : '.png';
    const randomId = crypto.randomBytes(16).toString('hex');
    const newStoragePath = `qr_${Date.now()}_${randomId}${safeExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('qr-codes')
      .upload(newStoragePath, req.file.buffer, {
        contentType: verifiedMimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('QR upload error:', uploadError);
      return res.status(500).json({ success: false, error: 'Server error during QR upload' });
    }

    // Retrieve previous storage path from settings
    const { data: prevRow } = await supabase
      .from('settings').select('value').eq('key', 'qr_storage_path').maybeSingle();
    const prevStoragePath = prevRow && prevRow.value ? prevRow.value.trim() : null;

    // Update settings and write audit log
    await supabase.from('settings').upsert(
      { key: 'qr_storage_path', value: newStoragePath },
      { onConflict: 'key' }
    );

    await supabase.from('qr_audit_log').insert({
      ip_address: req.ip || 'unknown',
      previous_storage_path: prevStoragePath,
      new_storage_path: newStoragePath
    });

    // Finding 11: Cleanup previous QR file from Supabase Storage if replaced and different
    if (prevStoragePath && prevStoragePath !== newStoragePath) {
      await supabase.storage.from('qr-codes').remove([prevStoragePath]);
    }

    return res.json({
      success: true,
      qr_storage_path: newStoragePath,
      qr_image_url: '/api/payment/qr'
    });
  } catch (err) {
    console.error('Error processing QR upload:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// DELETE /api/admin/settings/qr
router.delete('/settings/qr', async (req, res) => {
  try {
    const { data: prevRow } = await supabase
      .from('settings').select('value').eq('key', 'qr_storage_path').maybeSingle();
    const prevStoragePath = prevRow && prevRow.value ? prevRow.value.trim() : null;

    if (!prevStoragePath) {
      return res.status(400).json({ success: false, error: 'No active QR code to remove' });
    }

    // Delete setting
    await supabase.from('settings').delete().eq('key', 'qr_storage_path');

    // Audit log
    await supabase.from('qr_audit_log').insert({
      ip_address: req.ip || 'unknown',
      previous_storage_path: prevStoragePath,
      new_storage_path: null
    });

    // Remove file from Supabase Storage
    await supabase.storage.from('qr-codes').remove([prevStoragePath]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting QR:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
