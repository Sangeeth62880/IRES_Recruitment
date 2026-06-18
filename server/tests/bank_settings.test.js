/**
 * Bank Settings API Tests
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

async function run() {
  console.log('\n--- Bank Settings API Tests ---\n');

  // Test 1: GET /api/settings/bank
  await test('GET /api/settings/bank → should return all keys (even if empty)', async () => {
    const res = await fetch(`${BASE}/api/settings/bank`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    const keys = ['bank_name', 'account_holder', 'account_number', 'ifsc_code', 'branch_name'];
    keys.forEach(k => {
      assert(k in data, `Expected key ${k} to be in response`);
    });
  });

  // Test 2: PATCH /api/admin/settings/bank without auth
  await test('PATCH /api/admin/settings/bank (No Auth) → should fail with 401', async () => {
    const res = await fetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bank_name: 'Test Bank' })
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // Login for remaining tests
  await loginAsAdmin();

  // Test 3: PATCH /api/admin/settings/bank valid data
  await test('PATCH /api/admin/settings/bank (Valid Data) → should succeed', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '123456789012',
      ifsc_code: 'FDRL0001234',
      branch_name: 'CUSAT Campus'
    };
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(data.bank_details.bank_name === 'Federal Bank', `Expected Federal Bank, got ${data.bank_details.bank_name}`);
  });

  // Test 4: Invalid bank details validation (account number letter)
  await test('PATCH /api/admin/settings/bank (Invalid Account Number: letters) → should fail with 400', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '12345678901A', // letter in account number
      ifsc_code: 'FDRL0001234',
      branch_name: 'CUSAT Campus'
    };
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Test 5: Invalid IFSC
  await test('PATCH /api/admin/settings/bank (Invalid IFSC Format) → should fail with 400', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '123456789012',
      ifsc_code: 'FDRL1001234', // 5th digit must be 0
      branch_name: 'CUSAT Campus'
    };
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Cleanup Settings
  const keys = ['bank_name', 'account_holder', 'account_number', 'ifsc_code', 'branch_name'];
  db.transaction(() => {
    keys.forEach(k => {
      db.prepare("DELETE FROM settings WHERE key = ?").run(k);
    });
  })();

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
