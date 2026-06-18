const express = require('express');
const db = require('../db');
const { VALID_TEAMS, TEAM_LABELS } = require('../../shared/constants.json');

const router = express.Router();
const VALID_DISPLAY_NAMES = Object.values(TEAM_LABELS);

// POST /api/register
router.post('/api/register', (req, res) => {
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

    // Validate UTR: exactly 12 digits
    if (!/^\d{12}$/.test(utr_number.trim())) {
      return res.status(400).json({
        success: false,
        error: 'UTR number must be exactly 12 digits (numeric only)'
      });
    }

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
      null       // screenshot_path is now null
    );

    return res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: 'Server error during registration' });
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
