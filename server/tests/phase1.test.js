/**
 * Phase 1 Tests: Database setup verification
 * Run with: node tests/phase1.test.js
 */

const path = require('path');

// Use a separate test database
const Database = require('better-sqlite3');
const fs = require('fs');

const testDbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}

// Import the main db to test against
const db = require('../db');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n--- Phase 1 Tests: Database Setup ---\n');

// Test 1: Check both tables exist
test('registrations table exists', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registrations'").get();
  assert(row && row.name === 'registrations', 'registrations table not found');
});

test('settings table exists', () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
  assert(row && row.name === 'settings', 'settings table not found');
});

// Test 2: Insert and read a registration row
test('insert and read a registration row', () => {
  const insert = db.prepare(`
    INSERT INTO registrations (name, department, year, team_selected, email, phone, utr_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = insert.run('Test User', 'CSE', '2nd', 'Technical', 'test@test.com', '9876543210', '123456789012');
  assert(info.changes === 1, 'Insert did not affect 1 row');

  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);
  assert(row.name === 'Test User', `Expected name 'Test User', got '${row.name}'`);
  assert(row.utr_number === '123456789012', `Expected utr '123456789012', got '${row.utr_number}'`);
  assert(row.verified === 0, `Expected verified=0, got ${row.verified}`);

  // Clean up
  db.prepare('DELETE FROM registrations WHERE id = ?').run(info.lastInsertRowid);
});

// Test 3: Insert and read a settings row
test('insert and read a settings row', () => {
  const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  insert.run('test_key', 'test_value');

  const row = db.prepare('SELECT * FROM settings WHERE key = ?').get('test_key');
  assert(row.value === 'test_value', `Expected 'test_value', got '${row.value}'`);

  // Clean up
  db.prepare('DELETE FROM settings WHERE key = ?').run('test_key');
});

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
process.exit(failed > 0 ? 1 : 0);
