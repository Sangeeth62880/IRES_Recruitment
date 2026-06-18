const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// All admin routes require authentication
router.use(requireAdmin);

// GET /api/admin/registrations
router.get('/registrations', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM registrations ORDER BY submitted_at DESC').all();
    const result = rows.map(row => ({
      ...row,
      verified: !!row.verified,
      flagged: !!row.flagged,
      payment_status: row.payment_status || null,
      screenshot_url: null // screenshots removed
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
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
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

module.exports = router;
