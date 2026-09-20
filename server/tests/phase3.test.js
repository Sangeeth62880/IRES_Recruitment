/**
 * Phase 3 Tests: Admin API Endpoints (session-based auth)
 * Run with: node tests/phase3.test.js
 * Requires server running on port 3001
 */

const db = require('../db');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
const cleanupIds = [];

// We need to track cookies for session-based auth
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
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.3.0.1' },
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
  return res;
}

function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Forwarded-For': '10.3.0.1',
      'Cookie': sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    }
  });
}

async function run() {
  console.log('\n--- Phase 3 Tests: Admin API Endpoints ---\n');

  // Test 1: GET registrations without auth → 401
  await test('GET /api/admin/registrations without auth → 401', async () => {
    const res = await fetch(`${BASE}/api/admin/registrations`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // Login for subsequent tests
  await loginAsAdmin();

  // Test 2: GET registrations with valid session → array
  await test('GET /api/admin/registrations with valid session → array', async () => {
    const res = await adminFetch(`${BASE}/api/admin/registrations`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), `Expected array, got ${typeof data}`);
  });

  // Test 3: Insert, verify, confirm
  await test('Insert registration → PATCH verify → confirm verified', async () => {
    // Insert directly into DB with new schema
    const info = db.prepare(`
      INSERT INTO registrations (name, email, phone, institution, utr_number, fee_tier)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Admin Test User', 'admin@test.com', '9876543210', 'CUSAT', '444455556666', 'regular');
    cleanupIds.push(info.lastInsertRowid);

    // Verify via API
    const verifyRes = await adminFetch(`${BASE}/api/admin/registrations/${info.lastInsertRowid}/verify`, {
      method: 'PATCH'
    });
    const verifyData = await verifyRes.json();
    assert(verifyData.success === true, `Expected verify success, got ${JSON.stringify(verifyData)}`);

    // Confirm in list
    const listRes = await adminFetch(`${BASE}/api/admin/registrations`);
    const list = await listRes.json();
    const found = list.find(r => r.id === Number(info.lastInsertRowid));
    assert(found && found.verified === true, `Expected verified=true, got ${found ? found.verified : 'not found'}`);
  });

  // Test 4: CSV export
  await test('GET /api/admin/export/csv → Content-Type: text/csv', async () => {
    const res = await adminFetch(`${BASE}/api/admin/export/csv`);
    const contentType = res.headers.get('content-type');
    assert(contentType && contentType.includes('text/csv'), `Expected text/csv, got ${contentType}`);
    
    // Verify CSV headers match new schema
    const csv = await res.text();
    const headerLine = csv.split('\n')[0];
    assert(headerLine.includes('institution'), 'CSV headers should include institution');
    assert(headerLine.includes('fee_tier'), 'CSV headers should include fee_tier');
    assert(!headerLine.includes('department'), 'CSV headers should NOT include department');
    assert(!headerLine.includes('team_selected'), 'CSV headers should NOT include team_selected');
  });

  // Test 5: Save and get pricing (new dual-fee system)
  await test('POST /api/admin/settings/pricing → success', async () => {
    const pricingRes = await adminFetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ early_bird_fee: 299, regular_fee: 499, early_bird_enabled: true })
    });
    const pricingData = await pricingRes.json();
    assert(pricingData.success === true, `Expected success, got ${JSON.stringify(pricingData)}`);
    assert(pricingData.early_bird_fee === 299, `Expected early_bird_fee=299, got ${pricingData.early_bird_fee}`);
    assert(pricingData.regular_fee === 499, `Expected regular_fee=499, got ${pricingData.regular_fee}`);
    assert(pricingData.early_bird_enabled === true, `Expected early_bird_enabled=true, got ${pricingData.early_bird_enabled}`);
  });

  // Test 6: Verify public fee endpoint reflects early bird when enabled
  await test('GET /api/settings/fee → returns early_bird tier when enabled', async () => {
    const res = await fetch(`${BASE}/api/settings/fee`);
    const data = await res.json();
    assert(data.tier === 'early_bird', `Expected tier=early_bird, got ${data.tier}`);
    assert(data.fee === 299, `Expected fee=299, got ${data.fee}`);
  });

  // Test 7: Toggle early bird off and verify regular fee
  await test('Toggle early bird off → public fee returns regular', async () => {
    await adminFetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ early_bird_enabled: false })
    });

    const res = await fetch(`${BASE}/api/settings/fee`);
    const data = await res.json();
    assert(data.tier === 'regular', `Expected tier=regular, got ${data.tier}`);
    assert(data.fee === 499, `Expected fee=499, got ${data.fee}`);
  });

  // Cleanup
  db.prepare("DELETE FROM settings WHERE key IN ('early_bird_fee', 'regular_fee', 'early_bird_enabled')").run();
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
