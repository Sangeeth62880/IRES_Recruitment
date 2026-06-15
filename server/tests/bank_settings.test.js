/**
 * Integration Tests for Bank Settings API
 * Run with: node tests/bank_settings.test.js
 * Requires server running on port 3001
 */

const db = require('../db');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
let sessionCookie = '';

function test(name, fn) {
  return fn().then(() => {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  }).catch(err => {
    console.log(`  ✗ FAIL: ${name} — ${err.message}`);
    failed++;
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' })
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  if (setCookie && setCookie[0]) {
    sessionCookie = setCookie[0].split(';')[0];
  }
}

function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Cookie': sessionCookie
    }
  });
}

// Backup current settings to restore after test
const originalSettings = {};
const keys = ['bank_name', 'account_holder', 'account_number', 'ifsc_code', 'branch_name'];

async function run() {
  console.log('\n--- Bank Settings API Tests ---\n');

  // Backup existing DB state
  keys.forEach(k => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(k);
    originalSettings[k] = row ? row.value : null;
  });

  // Test 1: GET /api/settings/bank (public)
  await test('GET /api/settings/bank → should return all keys (even if empty)', async () => {
    const res = await fetch(`${BASE}/api/settings/bank`);
    assert(res.ok, `Expected status 200, got ${res.status}`);
    const data = await res.json();
    keys.forEach(k => {
      assert(k in data, `Expected key ${k} in response`);
    });
  });

  // Test 2: PATCH /api/admin/settings/bank without auth → fail
  await test('PATCH /api/admin/settings/bank (No Auth) → should fail with 401', async () => {
    const res = await fetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_name: 'Test Bank' })
    });
    assert(res.status === 401, `Expected status 401, got ${res.status}`);
  });

  // Perform Admin Login
  await loginAsAdmin();
  assert(sessionCookie !== '', 'Failed to obtain session cookie for admin login');

  // Test 3: PATCH /api/admin/settings/bank with valid data → success
  await test('PATCH /api/admin/settings/bank (Valid Data) → should succeed', async () => {
    const testData = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '123456789012',
      ifsc_code: 'FDRL0001234',
      branch_name: 'CUSAT Campus'
    };

    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });

    assert(res.ok, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.success === true, 'Expected success: true');
    assert(body.bank_details.bank_name === 'Federal Bank', 'Bank name mismatch');
    assert(body.bank_details.account_number === '123456789012', 'Account number mismatch');

    // Verify GET public returns the saved values
    const getRes = await fetch(`${BASE}/api/settings/bank`);
    const getData = await getRes.json();
    assert(getData.bank_name === 'Federal Bank', 'Public GET bank name mismatch');
    assert(getData.account_number === '123456789012', 'Public GET account number mismatch');
  });

  // Test 4: Validation - Invalid account number (non-numeric) → fail
  await test('PATCH /api/admin/settings/bank (Invalid Account Number: letters) → should fail with 400', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_number: '12345ABC678' })
    });
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
    const body = await res.json();
    assert(body.success === false, 'Expected success: false');
    assert(body.error.includes('Account number'), 'Expected account number error message');
  });

  // Test 5: Validation - Invalid account number (too short) → fail
  await test('PATCH /api/admin/settings/bank (Invalid Account Number: too short) → should fail with 400', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_number: '12345678' }) // 8 digits
    });
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
  });

  // Test 6: Validation - Invalid account number (too long) → fail
  await test('PATCH /api/admin/settings/bank (Invalid Account Number: too long) → should fail with 400', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_number: '1234567890123456789' }) // 19 digits
    });
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
  });

  // Test 7: Validation - Invalid IFSC code format → fail
  await test('PATCH /api/admin/settings/bank (Invalid IFSC Format) → should fail with 400', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ifsc_code: 'FDRL1123456' }) // 5th character is not '0'
    });
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
    const body = await res.json();
    assert(body.success === false, 'Expected success: false');
    assert(body.error.includes('IFSC'), 'Expected IFSC error message');
  });

  // Test 8: Validation - Field length too long → fail
  await test('PATCH /api/admin/settings/bank (Field too long) → should fail with 400', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_name: 'a'.repeat(101) })
    });
    assert(res.status === 400, `Expected status 400, got ${res.status}`);
  });

  // Test 9: Optional fields empty -> should allow clearing
  await test('PATCH /api/admin/settings/bank (Clear fields) → should succeed', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_name: '',
        account_holder: '',
        account_number: '',
        ifsc_code: '',
        branch_name: ''
      })
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.success === true, 'Expected success: true');
    
    // Verify values in DB are empty strings
    const getRes = await fetch(`${BASE}/api/settings/bank`);
    const getData = await getRes.json();
    assert(getData.bank_name === '', 'Expected empty bank name');
    assert(getData.account_number === '', 'Expected empty account number');
  });

  // Restore original settings
  db.transaction(() => {
    Object.entries(originalSettings).forEach(([key, value]) => {
      if (value === null) {
        db.prepare("DELETE FROM settings WHERE key = ?").run(key);
      } else {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
      }
    });
  })();

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
