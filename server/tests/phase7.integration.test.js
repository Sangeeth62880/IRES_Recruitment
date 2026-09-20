/**
 * Phase 7 Integration Test: Full end-to-end flow
 * Run with: node tests/phase7.integration.test.js
 * Requires server running on port 3001
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');

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

function makeFormData(payload) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      fd.append(key, String(value));
    }
  }
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const blob = new Blob([Buffer.concat([pngHeader, Buffer.from('integration test content')])], { type: 'image/png' });
  fd.append('screenshot', blob, 'integration_test.png');
  return fd;
}

let csrfToken = '';

async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.7.0.1' },
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
      'X-Forwarded-For': '10.7.0.1',
      'Cookie': sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    }
  });
}

async function run() {
  console.log('\n--- Phase 7 Integration Tests: Full E2E Flow ---\n');

  const TEST_UTR = '777766665555';

  try {
    // Step 1: Register
    await test('Step 1: Submit a registration', async () => {
      const payload = {
        name: 'Integration Test User',
        institution: 'CUSAT University',
        email: 'integration@test.com',
        phone: '9876543210',
        utr_number: TEST_UTR
      };

      const res = await fetch(`${BASE}/api/register`, {
        method: 'POST',
        headers: { 'X-Forwarded-For': '10.7.0.1' },
        body: makeFormData(payload)
      });
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
      assert(found.screenshot_url !== null, `Expected screenshot_url to be present`);
    });

    // Step 3: Verify manually
    await test('Step 3: Verify registration manually', async () => {
      const res = await adminFetch(`${BASE}/api/admin/registrations/${registrationId}/verify`, {
        method: 'PATCH'
      });
      const data = await res.json();
      assert(data.success === true, 'Expected manual verification success');
    });

    // Step 4: Confirm registration is now verified
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

  } finally {
    // Cleanup in case of failures or leftovers
    if (registrationId) {
      const { data: row } = await supabase
        .from('registrations')
        .select('screenshot_storage_path')
        .eq('id', registrationId)
        .maybeSingle();
      if (row && row.screenshot_storage_path) {
        await supabase.storage.from('payment-screenshots').remove([row.screenshot_storage_path]);
      }
      await supabase.from('registrations').delete().eq('id', registrationId);
    }
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
