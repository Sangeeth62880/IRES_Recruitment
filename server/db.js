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
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    institution TEXT NOT NULL,
    utr_number TEXT NOT NULL UNIQUE,
    fee_tier TEXT,
    screenshot_path TEXT,
    verified INTEGER DEFAULT 0,
    flagged INTEGER DEFAULT 0,
    payment_status TEXT DEFAULT NULL,
    submitted_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_utr ON registrations(utr_number);

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

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expired INTEGER NOT NULL,
    sess TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS settings_key_unique ON settings(key);
`);

module.exports = db;
