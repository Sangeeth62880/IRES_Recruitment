/**
 * Phase 7 Integration Test: Full end-to-end flow
 * Run with: node tests/phase7.integration.test.js
 * Requires server running on port 3001
 */

const db = require('../db');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
let sessionCookie = '';
let registrationId = null;

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
  console.log('\n--- Phase 7 Integration Tests: Full E2E Flow ---\n');

  const TEST_UTR = '777766665555';

  // Step 1: Register
  await test('Step 1: Submit a registration', async () => {
    const formData = new FormData();
    formData.append('name', 'Integration Test User');
    formData.append('department', 'CSE');
    formData.append('year', '2nd');
    formData.append('team_selected', 'Technical');
    formData.append('email', 'integration@test.com');
    formData.append('phone', '9876543210');
    formData.append('utr_number', TEST_UTR);

    // Add a dummy screenshot
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82
    ]);
    const blob = new Blob([pngBuffer], { type: 'image/png' });
    formData.append('screenshot', blob, 'test.png');

    const res = await fetch(`${BASE}/api/register`, { method: 'POST', body: formData });
    const data = await res.json();
    assert(data.success === true, `Registration failed: ${JSON.stringify(data)}`);
    registrationId = data.id;
  });

  // Login as admin
  await loginAsAdmin();

  // Step 2: Confirm appears in admin GET
  await test('Step 2: Registration appears in admin list', async () => {
    const res = await adminFetch(`${BASE}/api/admin/registrations`);
    const data = await res.json();
    const found = data.find(r => r.id === registrationId);
    assert(found, `Registration id ${registrationId} not found in admin list`);
    assert(found.name === 'Integration Test User', `Expected 'Integration Test User', got '${found.name}'`);
    assert(found.verified === false, `Expected verified=false, got ${found.verified}`);
  });

  // Step 3: Verify via statement upload
  await test('Step 3: Verify via CSV statement upload', async () => {
    const csvContent = `Date,Description,Credit\n2024-01-15,UPI/CR/${TEST_UTR}/IntegrationPayer,200\n`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('statement', blob, 'statement.csv');

    const res = await adminFetch(`${BASE}/api/admin/verify/statement`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    assert(data.matched >= 1, `Expected matched >= 1, got ${data.matched}`);

    // Call bulk-approve explicitly
    const approveRes = await adminFetch(`${BASE}/api/admin/verify/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [registrationId] })
    });
    const approveData = await approveRes.json();
    assert(approveData.success === true, 'Expected bulk approval success');
  });

  // Step 4: Confirm verified true
  await test('Step 4: Confirm registration is now verified', async () => {
    const res = await adminFetch(`${BASE}/api/admin/registrations`);
    const data = await res.json();
    const found = data.find(r => r.id === registrationId);
    assert(found && found.verified === true, `Expected verified=true`);
  });

  // Step 5: Export CSV contains the row
  await test('Step 5: Export CSV contains the registration', async () => {
    const res = await adminFetch(`${BASE}/api/admin/export/csv`);
    const csv = await res.text();
    assert(csv.includes(TEST_UTR), `CSV does not contain UTR ${TEST_UTR}`);
    assert(csv.includes('Integration Test User'), `CSV does not contain name`);
  });

  // Step 6: Delete the registration
  await test('Step 6: Delete the registration', async () => {
    const res = await adminFetch(`${BASE}/api/admin/registrations/${registrationId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    assert(data.success === true, `Delete failed: ${JSON.stringify(data)}`);
  });

  // Step 7: Confirm it's gone
  await test('Step 7: Confirm registration is deleted', async () => {
    const res = await adminFetch(`${BASE}/api/admin/registrations`);
    const data = await res.json();
    const found = data.find(r => r.id === registrationId);
    assert(!found, `Registration ${registrationId} still exists after delete`);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
