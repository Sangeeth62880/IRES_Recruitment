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

// Test 2: Verify new schema columns exist
test('registrations table has correct columns', () => {
  const columns = db.pragma('table_info(registrations)');
  const colNames = columns.map(c => c.name);
  
  // New required columns
  assert(colNames.includes('name'), 'Missing column: name');
  assert(colNames.includes('email'), 'Missing column: email');
  assert(colNames.includes('phone'), 'Missing column: phone');
  assert(colNames.includes('institution'), 'Missing column: institution');
  assert(colNames.includes('utr_number'), 'Missing column: utr_number');
  assert(colNames.includes('fee_tier'), 'Missing column: fee_tier');
  assert(colNames.includes('screenshot_path'), 'Missing column: screenshot_path');
  assert(colNames.includes('verified'), 'Missing column: verified');
  assert(colNames.includes('flagged'), 'Missing column: flagged');
  assert(colNames.includes('payment_status'), 'Missing column: payment_status');
  assert(colNames.includes('submitted_at'), 'Missing column: submitted_at');
  
  // Old columns should NOT exist
  assert(!colNames.includes('department'), 'Column "department" should be removed');
  assert(!colNames.includes('year'), 'Column "year" should be removed');
  assert(!colNames.includes('team_selected'), 'Column "team_selected" should be removed');
});

// Test 3: Insert and read a registration row with new schema
test('insert and read a registration row', () => {
  const testUtr = '98' + Date.now().toString().slice(-10);
  const insert = db.prepare(`
    INSERT INTO registrations (name, email, phone, institution, utr_number, fee_tier)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = insert.run('Test User', 'test@test.com', '9876543210', 'Test University', testUtr, 'early_bird');
  assert(info.changes === 1, 'Insert did not affect 1 row');

  const row = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);
  assert(row.name === 'Test User', `Expected name 'Test User', got '${row.name}'`);
  assert(row.email === 'test@test.com', `Expected email 'test@test.com', got '${row.email}'`);
  assert(row.institution === 'Test University', `Expected institution 'Test University', got '${row.institution}'`);
  assert(row.fee_tier === 'early_bird', `Expected fee_tier 'early_bird', got '${row.fee_tier}'`);
  assert(row.utr_number === testUtr, `Expected utr '${testUtr}', got '${row.utr_number}'`);
  assert(row.verified === 0, `Expected verified=0, got ${row.verified}`);

  // Clean up
  db.prepare('DELETE FROM registrations WHERE id = ?').run(info.lastInsertRowid);
});

// Test 4: Insert and read a settings row
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
