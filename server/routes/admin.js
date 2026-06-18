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

module.exports = router;
