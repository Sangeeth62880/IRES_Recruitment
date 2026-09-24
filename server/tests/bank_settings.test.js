/**
 * Bank Settings API Tests
 * Run with: node tests/bank_settings.test.js
 * Requires server running on port 3001
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');

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

let csrfToken = '';

async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.8.0.1' },
    body: JSON.stringify({ password: 'admin123' })
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  if (setCookies && setCookies.length > 0) {
    sessionCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  }
  const data = await res.json();
  if (data.csrfToken) {
    csrfToken = data.csrfToken;
  }
}

function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Forwarded-For': '10.8.0.1',
      'Cookie': sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
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

  // Test 3: PATCH /api/admin/settings/bank missing password → should fail with 403
  await test('PATCH /api/admin/settings/bank (Missing Password) → should fail with 403', async () => {
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
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // Test 4: PATCH /api/admin/settings/bank wrong password → should fail with 403
  await test('PATCH /api/admin/settings/bank (Wrong Password) → should fail with 403', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '123456789012',
      ifsc_code: 'FDRL0001234',
      branch_name: 'CUSAT Campus',
      confirm_password: 'wrong_password_999'
    };
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // Test 5: PATCH /api/admin/settings/bank valid data with confirm_password
  await test('PATCH /api/admin/settings/bank (Valid Data with Password) → should succeed', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '123456789012',
      ifsc_code: 'FDRL0001234',
      branch_name: 'CUSAT Campus',
      confirm_password: 'admin123'
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

  // Test 6: Invalid bank details validation (account number letter)
  await test('PATCH /api/admin/settings/bank (Invalid Account Number: letters) → should fail with 400', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '12345678901A', // letter in account number
      ifsc_code: 'FDRL0001234',
      branch_name: 'CUSAT Campus',
      confirm_password: 'admin123'
    };
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Test 7: Invalid IFSC
  await test('PATCH /api/admin/settings/bank (Invalid IFSC Format) → should fail with 400', async () => {
    const payload = {
      bank_name: 'Federal Bank',
      account_holder: 'SEDS CUSAT',
      account_number: '123456789012',
      ifsc_code: 'FDRL1001234', // 5th digit must be 0
      branch_name: 'CUSAT Campus',
      confirm_password: 'admin123'
    };
    const res = await adminFetch(`${BASE}/api/admin/settings/bank`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Test 8: Lockdown unit logic
  await test('Server Lockdown Guard: isBankSettingsLocked evaluates LOCK_BANK_SETTINGS', async () => {
    const { isBankSettingsLocked } = require('../middleware/adminAuth');
    process.env.LOCK_BANK_SETTINGS = 'true';
    assert(isBankSettingsLocked() === true, 'Expected true when LOCK_BANK_SETTINGS is true');
    process.env.LOCK_BANK_SETTINGS = 'false';
    assert(isBankSettingsLocked() === false, 'Expected false when LOCK_BANK_SETTINGS is false');
    delete process.env.LOCK_BANK_SETTINGS;
  });

  // Test 9: Step-up password verification logic
  await test('Step-Up Auth: verifyAdminPassword validates password strictly and timing-safely', async () => {
    const { verifyAdminPassword } = require('../middleware/adminAuth');
    assert(verifyAdminPassword('admin123') === true, 'Expected true for correct password');
    assert(verifyAdminPassword('wrong') === false, 'Expected false for incorrect password');
    assert(verifyAdminPassword('') === false, 'Expected false for empty password');
    assert(verifyAdminPassword(null) === false, 'Expected false for null');
  });

  // Test 10: GET /api/settings/bank returns is_locked property
  await test('GET /api/settings/bank returns is_locked property', async () => {
    const res = await fetch(`${BASE}/api/settings/bank`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert('is_locked' in data, 'Expected is_locked key in response');
    assert(typeof data.is_locked === 'boolean', 'Expected is_locked to be boolean');
  });

  // Cleanup Settings via Supabase client
  const keys = ['bank_name', 'account_holder', 'account_number', 'ifsc_code', 'branch_name'];
  await supabase.from('settings').delete().in('key', keys);

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
