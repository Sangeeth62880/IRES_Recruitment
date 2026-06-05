const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'registrations.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    year TEXT NOT NULL,
    team_selected TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    utr_number TEXT NOT NULL,
    screenshot_path TEXT,
    verified INTEGER DEFAULT 0,
    submitted_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS qr_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    changed_at TEXT,
    ip_address TEXT,
    previous_filename TEXT,
    new_filename TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS settings_key_unique ON settings(key);
`);

// Migration: add flagged column if it doesn't exist
const columns = db.pragma('table_info(registrations)');
const hasFlagged = columns.some(col => col.name === 'flagged');
if (!hasFlagged) {
  db.exec('ALTER TABLE registrations ADD COLUMN flagged INTEGER DEFAULT 0');
}

// Migration: add payment_status column if it doesn't exist
const columns2 = db.pragma('table_info(registrations)');
const hasPaymentStatus = columns2.some(col => col.name === 'payment_status');
if (!hasPaymentStatus) {
  db.exec('ALTER TABLE registrations ADD COLUMN payment_status TEXT DEFAULT NULL');
}

module.exports = db;
