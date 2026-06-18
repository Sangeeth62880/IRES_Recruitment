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

async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin123' })
  });
  // Extract Set-Cookie header
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  if (setCookie && setCookie[0]) {
    sessionCookie = setCookie[0].split(';')[0];
  }
  return res;
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
    // Insert directly into DB
    const info = db.prepare(`
      INSERT INTO registrations (name, department, year, team_selected, utr_number)
      VALUES (?, ?, ?, ?, ?)
    `).run('Admin Test User', 'ECE', '3rd', 'Design', '444455556666');
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
  });

  // Cleanup
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
