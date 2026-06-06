const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// All admin routes require authentication
router.use(requireAdmin);

// Configure multer for QR code uploads
const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../data/uploads/qr/'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `qr_${Date.now()}${ext}`);
  }
});

const uploadQR = multer({
  storage: qrStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
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
      screenshot_url: row.screenshot_path ? `/uploads/screenshots/${row.screenshot_path}` : null
    }));
    return res.json(result);
  } catch (err) {
    console.error('Error fetching registrations:', err);
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
    // Get the screenshot path before deleting
    const row = db.prepare('SELECT screenshot_path FROM registrations WHERE id = ?').get(id);
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);

    // Optionally delete the screenshot file
    if (row && row.screenshot_path) {
      const filePath = path.join(__dirname, '..', 'data', 'uploads', 'screenshots', row.screenshot_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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

    const headers = ['id', 'name', 'department', 'year', 'team_selected', 'email', 'phone', 'utr_number', 'verified', 'submitted_at'];
    const csvRows = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map(h => {
        let val = row[h];
        if (h === 'verified') val = val ? 'Yes' : 'No';
        if (val === null || val === undefined) val = '';
        // Escape commas and quotes in CSV values
        val = String(val);
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

// POST /api/admin/settings/qr
router.post('/settings/qr', uploadQR.single('qr_image'), (req, res) => {
  try {
    const { confirm_change } = req.body;
    if (confirm_change !== 'YES_CHANGE_QR') {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(403).json({ success: false, error: 'QR change requires explicit confirmation' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No QR image uploaded' });
    }

    const filename = req.file.filename;

    // Compute SHA-256 hash of the uploaded file
    const fileBuffer = fs.readFileSync(req.file.path);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // 1. Read previous QR filename from DB BEFORE updating:
    const prev = db.prepare("SELECT value FROM settings WHERE key = 'qr_path'").get();
    const previousFilename = prev ? prev.value : 'Initial Upload';

    // 2. Save new file + update settings DB:
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('qr_path', ?)").run(filename);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('qr_hash', ?)").run(hash);

    // 3. Then insert audit row:
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    db.prepare("INSERT INTO qr_audit_log (changed_at, ip_address, previous_filename, new_filename) VALUES (?, ?, ?, ?)")
      .run(new Date().toISOString(), ip, previousFilename, filename);

    // Clean up previous file to prevent directory bloating
    if (previousFilename && previousFilename !== 'Initial Upload') {
      const previousFilePath = path.join(__dirname, '../data/uploads/qr/', previousFilename);
      if (fs.existsSync(previousFilePath)) {
        try { fs.unlinkSync(previousFilePath); } catch (e) {}
      }
    }

    return res.json({ success: true, qr_url: '/uploads/qr/' + filename });
  } catch (err) {
    console.error('QR upload error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/settings/fee
router.get('/settings/fee', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'registration_fee'").get();
    return res.json({ fee: row ? parseInt(row.value, 10) || 0 : 0 });
  } catch (err) {
    console.error('Error fetching fee:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/admin/settings/fee
router.post('/settings/fee', (req, res) => {
  try {
    const { fee } = req.body;
    if (fee === undefined || fee === null || isNaN(parseInt(fee, 10))) {
      return res.status(400).json({ success: false, error: 'Valid fee amount is required' });
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('registration_fee', ?)").run(String(fee));
    return res.json({ success: true, fee: parseInt(fee, 10) });
  } catch (err) {
    console.error('Fee update error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// PATCH /api/admin/registrations/:id/unflag
router.patch('/registrations/:id/unflag', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('UPDATE registrations SET flagged = 0 WHERE id = ?').run(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/qr/verify
router.get('/qr/verify', (req, res) => {
  try {
    const qrPathRow = db.prepare("SELECT value FROM settings WHERE key = 'qr_path'").get();
    const qrHashRow = db.prepare("SELECT value FROM settings WHERE key = 'qr_hash'").get();

    if (!qrPathRow || !qrPathRow.value) {
      return res.json({ intact: true });
    }

    const qrFilename = qrPathRow.value;
    const expectedHash = qrHashRow ? qrHashRow.value : '';

    const absolutePath = path.join(__dirname, '../data/uploads/qr/', qrFilename);
    if (!fs.existsSync(absolutePath)) {
      return res.json({ intact: false });
    }

    const fileBuffer = fs.readFileSync(absolutePath);
    const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (actualHash === expectedHash) {
      return res.json({ intact: true });
    } else {
      return res.json({ intact: false });
    }
  } catch (err) {
    console.error('Error verifying QR integrity:', err);
    return res.status(500).json({ success: false, error: 'Server error during QR verification' });
  }
});

// GET /api/admin/qr/audit
router.get('/qr/audit', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM qr_audit_log ORDER BY changed_at DESC').all();
    return res.json(logs);
  } catch (err) {
    console.error('Error fetching QR audit logs:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/admin/teams/slugs
router.get('/teams/slugs', (req, res) => {
  try {
    const { VALID_TEAMS } = require('../../shared/constants.json');
    const slugs = {};
    VALID_TEAMS.forEach(team => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`team_slug_${team}`);
      slugs[team] = row ? row.value : '';
    });
    return res.json(slugs);
  } catch (err) {
    console.error('Error fetching team slugs:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/admin/teams/slugs/regenerate
router.post('/teams/slugs/regenerate', (req, res) => {
  try {
    const { team } = req.body;
    const { VALID_TEAMS } = require('../../shared/constants.json');
    if (!team || !VALID_TEAMS.includes(team)) {
      return res.status(400).json({ success: false, error: 'Invalid team slug' });
    }
    const generateUniqueSlug = (t) => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let suffix = '';
      for (let i = 0; i < 5; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `${t}_${suffix}`;
    };
    const newSlug = generateUniqueSlug(team);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`team_slug_${team}`, newSlug);
    return res.json({ success: true, slug: newSlug });
  } catch (err) {
    console.error('Error regenerating team slug:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
