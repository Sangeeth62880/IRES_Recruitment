const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const db = require('../db');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();
router.use(requireAdmin);

// Multer for statement uploads (temp storage)
const statementUpload = multer({
  dest: path.join(__dirname, '..', 'data', 'uploads', 'temp'),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/**
 * Extract all 12-digit UTR numbers from any text
 */
function extractUTRs(text) {
  const utrs = new Set();
  if (!text) return utrs;

  const str = String(text);

  // Pattern 1: UPI/CR/<12digits>/ or UPI/DR/<12digits>/
  const upiPattern = /UPI\/(?:CR|DR)\/(\d{12})\//gi;
  let match;
  while ((match = upiPattern.exec(str)) !== null) {
    utrs.add(match[1]);
  }

  // Pattern 2: Any standalone 12-digit number
  const digitPattern = /\b(\d{12})\b/g;
  while ((match = digitPattern.exec(str)) !== null) {
    utrs.add(match[1]);
  }

  return utrs;
}

/**
 * Extract UTRs from all cells in a 2D array of rows.
 * Returns a Map<UTR, amount|null> — tries to pair each UTR with
 * a numeric amount from the same row.
 */
function extractUTRsFromRows(rows) {
  // Try to find an "amount" column
  const amountColNames = ['amount', 'credit', 'debit', 'value', 'txn amount', 'transaction amount', 'cr', 'deposit'];

  let amountKey = null;
  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    for (const key of keys) {
      if (amountColNames.includes(key.toLowerCase().trim())) {
        amountKey = key;
        break;
      }
    }
  }

  const utrMap = new Map(); // UTR → amount (number or null)

  for (const row of rows) {
    // Extract all UTRs from this row
    const rowUTRs = new Set();
    for (const cell of Object.values(row)) {
      const found = extractUTRs(cell);
      found.forEach(u => rowUTRs.add(u));
    }

    // Get amount for this row
    let amount = null;
    if (amountKey && row[amountKey] !== undefined && row[amountKey] !== '') {
      const parsed = parseFloat(String(row[amountKey]).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(parsed)) {
        amount = Math.abs(parsed); // Use absolute value (credits might be negative in some formats)
      }
    }

    for (const utr of rowUTRs) {
      // If a UTR appears in multiple rows, keep the first found amount
      if (!utrMap.has(utr)) {
        utrMap.set(utr, amount);
      }
    }
  }

  return utrMap;
}

// POST /api/admin/verify/statement
router.post('/verify/statement', statementUpload.single('statement'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No statement file uploaded' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];

    if (ext === '.csv') {
      const content = fs.readFileSync(filePath, 'utf-8');
      rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, error: 'Unsupported file format. Use CSV or XLSX.' });
    }

    // Clean up temp file
    fs.unlinkSync(filePath);

    // Extract UTR → amount map from statement
    const statementUTRs = extractUTRsFromRows(rows);

    // Get registration fee from settings
    const feeRow = db.prepare("SELECT value FROM settings WHERE key = 'registration_fee'").get();
    const expectedAmount = feeRow && feeRow.value ? parseInt(feeRow.value, 10) : 349;

    // Get all unverified registrations
    const unverified = db.prepare('SELECT id, name, utr_number, department, year FROM registrations WHERE verified = 0').all();

    // Detect duplicate UTRs in the database (among unverified)
    const utrCounts = {};
    const utrOwners = {};
    for (const reg of unverified) {
      const utr = reg.utr_number ? reg.utr_number.trim() : '';
      if (utr && /^\d{12}$/.test(utr)) {
        utrCounts[utr] = (utrCounts[utr] || 0) + 1;
        if (!utrOwners[utr]) utrOwners[utr] = [];
        utrOwners[utr].push({ id: reg.id, name: reg.name });
      }
    }

    const results = [];

    for (const reg of unverified) {
      const utr = reg.utr_number ? reg.utr_number.trim() : '';

      let status = 'not_found';
      let statementAmount = null;
      let duplicateWith = [];

      // Check for duplicate UTR first
      if (utr && /^\d{12}$/.test(utr) && utrCounts[utr] > 1) {
        status = 'duplicate_utr';
        duplicateWith = utrOwners[utr]
          .filter(o => o.id !== reg.id)
          .map(o => ({ id: o.id, name: o.name }));

        // Still check if it's in the statement for the amount
        if (statementUTRs.has(utr)) {
          statementAmount = statementUTRs.get(utr);
        }
      } else if (!utr || !/^\d{12}$/.test(utr)) {
        // Invalid/missing UTR → not_found
        status = 'not_found';
      } else if (statementUTRs.has(utr)) {
        statementAmount = statementUTRs.get(utr);

        // If we have an amount, compare with expected fee
        if (statementAmount === null) {
          // No amount column detected — treat as matched (can't verify amount)
          status = 'matched';
        } else if (Math.round(statementAmount) === expectedAmount) {
          status = 'matched';
        } else {
          status = 'amount_mismatch';
        }
      } else {
        // UTR not in statement
        status = 'not_found';
      }

      results.push({
        id: reg.id,
        name: reg.name,
        department: reg.department,
        year: reg.year,
        utr_number: reg.utr_number,
        status,
        statement_amount: statementAmount,
        expected_amount: expectedAmount,
        duplicate_with: duplicateWith
      });
    }

    // Persist payment_status and flagged to DB in a single transaction
    const updateStatusStmt = db.prepare('UPDATE registrations SET payment_status = ?, flagged = ? WHERE id = ?');
    db.transaction(() => {
      for (const r of results) {
        const shouldFlag = r.status === 'not_found' ? 1 : 0;
        updateStatusStmt.run(r.status, shouldFlag, r.id);
      }
    })();

    const matchedCount = results.filter(r => r.status === 'matched').length;

    return res.json({
      success: true,
      total_utrs_in_statement: statementUTRs.size,
      total_in_statement: rows.length,
      matched: matchedCount,
      results
    });
  } catch (err) {
    console.error('Statement verification error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ success: false, error: 'Error processing statement' });
  }
});

// POST /api/admin/verify/sms
router.post('/verify/sms', (req, res) => {
  try {
    const { sms_text } = req.body;
    if (!sms_text) {
      return res.status(400).json({ success: false, error: 'sms_text is required' });
    }

    // Try various patterns to extract UTR from SMS
    let utr = null;

    // Pattern: "UPI Ref No XXXXXXXXXXXX" or "UPI Ref No. XXXXXXXXXXXX"
    const refNoPattern = /(?:UPI\s+)?Ref\s*(?:No\.?|Number)\s*:?\s*(\d{12})/i;
    let match = refNoPattern.exec(sms_text);
    if (match) utr = match[1];

    // Pattern: "UTR XXXXXXXXXXXX" or "UTR: XXXXXXXXXXXX"
    if (!utr) {
      const utrPattern = /UTR\s*:?\s*(\d{12})/i;
      match = utrPattern.exec(sms_text);
      if (match) utr = match[1];
    }

    // Pattern: UPI/CR/<12digits>/
    if (!utr) {
      const upiPattern = /UPI\/(?:CR|DR)\/(\d{12})\//i;
      match = upiPattern.exec(sms_text);
      if (match) utr = match[1];
    }

    // Fallback: any standalone 12-digit number
    if (!utr) {
      const digitPattern = /\b(\d{12})\b/;
      match = digitPattern.exec(sms_text);
      if (match) utr = match[1];
    }

    if (!utr) {
      return res.json({ success: false, error: 'UTR not found in SMS' });
    }

    // Find matching unverified registration
    const reg = db.prepare('SELECT id, name FROM registrations WHERE utr_number = ? AND verified = 0').get(utr);
    if (!reg) {
      return res.json({ success: false, error: 'No matching registration' });
    }

    db.prepare('UPDATE registrations SET verified = 1 WHERE id = ?').run(reg.id);

    return res.json({ success: true, matched_name: reg.name });
  } catch (err) {
    console.error('SMS verification error:', err);
    return res.status(500).json({ success: false, error: 'Error processing SMS' });
  }
});

// POST /api/admin/verify/bulk-approve
router.post('/verify/bulk-approve', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'ids array is required' });
    }

    if (ids.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    const stmt = db.prepare('UPDATE registrations SET verified = 1 WHERE id = ?');

    db.transaction(() => {
      for (const id of ids) {
        stmt.run(id);
      }
    })();

    return res.json({ success: true, count: ids.length });
  } catch (err) {
    console.error('Bulk approve error:', err);
    return res.status(500).json({ success: false, error: 'Server error during bulk approval' });
  }
});

module.exports = router;
