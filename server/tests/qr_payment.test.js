/**
 * QR Code Payment Display & Admin QR Management Tests
 * Run with: node tests/qr_payment.test.js
 * Requires server running on port 3001
 */

const db = require('../db');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
let sessionCookie = '';
let csrfToken = '';

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
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.0.1' },
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
      'X-Forwarded-For': '10.99.0.1',
      'Cookie': sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    }
  });
}

async function run() {
  console.log('\n--- QR Code Payment Display & Admin Management Tests ---\n');

  // Ensure clean state before tests
  db.prepare("DELETE FROM settings WHERE key IN ('payment_display_mode', 'qr_image_filename')").run();

  // Test 1: GET /api/payment/qr when no QR is configured → 404
  await test('GET /api/payment/qr when unset → 404 Not Found', async () => {
    const res = await fetch(`${BASE}/api/payment/qr`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  // Test 2: GET /api/payment/qr rejects custom filename query attempt
  await test('GET /api/payment/qr with query param filename → rejected with 400', async () => {
    const res = await fetch(`${BASE}/api/payment/qr?filename=arbitrary.png`);
    assert(res.status === 400, `Expected 400 for filename query param, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success=false');
  });

  // Test 3: Public settings default display mode is 'bank'
  await test('GET /api/settings/payment → defaults to bank mode without QR', async () => {
    const res = await fetch(`${BASE}/api/settings/payment`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.payment_display_mode === 'bank', `Expected 'bank', got '${data.payment_display_mode}'`);
    assert(data.qr_image_url === null, `Expected qr_image_url=null, got '${data.qr_image_url}'`);
  });

  // Test 4: POST /api/admin/settings/qr without authentication → 401
  await test('POST /api/admin/settings/qr (No Auth) → 401 Unauthorized', async () => {
    const fd = new FormData();
    const blob = new Blob([Buffer.from('not authed')], { type: 'image/png' });
    fd.append('qr_image', blob, 'test_qr.png');

    const res = await fetch(`${BASE}/api/admin/settings/qr`, {
      method: 'POST',
      body: fd
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // Login as admin for remaining management tests
  await loginAsAdmin();

  // Test 5: POST /api/admin/settings/qr without CSRF token → 403
  await test('POST /api/admin/settings/qr (No CSRF token) → 403 Forbidden', async () => {
    const fd = new FormData();
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    const blob = new Blob([pngHeader], { type: 'image/png' });
    fd.append('qr_image', blob, 'test_qr.png');

    const res = await fetch(`${BASE}/api/admin/settings/qr`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie
        // Omit X-CSRF-Token
      },
      body: fd
    });
    assert(res.status === 403, `Expected 403 without CSRF token, got ${res.status}`);
  });

  // Test 6: POST /api/admin/settings/qr with spoofed mimetype (non-image) → 400
  await test('POST /api/admin/settings/qr with non-image file → 400 Bad Request', async () => {
    const fd = new FormData();
    const fakeBlob = new Blob([Buffer.from('plain text masquerading as png')], { type: 'image/png' });
    fd.append('qr_image', fakeBlob, 'fake_qr.png');

    const res = await adminFetch(`${BASE}/api/admin/settings/qr`, {
      method: 'POST',
      body: fd
    });
    assert(res.status === 400, `Expected 400 for spoofed file, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success=false');
  });

  let uploadedQrFilename = null;
  const auditLogsBefore = db.prepare("SELECT COUNT(*) as count FROM qr_audit_log").get().count;

  // Test 7: Upload valid PNG QR image → 200, updates settings and adds to qr_audit_log
  await test('POST /api/admin/settings/qr with valid PNG → 200 and records audit log', async () => {
    const fd = new FormData();
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x11, 0x22]);
    const blob = new Blob([pngHeader], { type: 'image/png' });
    fd.append('qr_image', blob, 'real_qr.png');

    const res = await adminFetch(`${BASE}/api/admin/settings/qr`, {
      method: 'POST',
      body: fd
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(typeof data.qr_image_filename === 'string' && data.qr_image_filename.startsWith('qr_'), 'Expected filename starting with qr_');
    assert(data.qr_image_url === '/api/payment/qr', `Expected /api/payment/qr, got ${data.qr_image_url}`);

    uploadedQrFilename = data.qr_image_filename;

    // Verify settings updated
    const row = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();
    assert(row && row.value === uploadedQrFilename, 'Setting qr_image_filename was not updated');

    // Verify qr_audit_log entry
    const auditLogsAfter = db.prepare("SELECT COUNT(*) as count FROM qr_audit_log").get().count;
    assert(auditLogsAfter === auditLogsBefore + 1, `Expected audit log count to increment by 1, got before: ${auditLogsBefore}, after: ${auditLogsAfter}`);

    const latestLog = db.prepare("SELECT * FROM qr_audit_log ORDER BY id DESC LIMIT 1").get();
    assert(latestLog.new_filename === uploadedQrFilename, `Expected latest log new_filename=${uploadedQrFilename}, got ${latestLog.new_filename}`);
    assert(latestLog.previous_filename === null, `Expected previous_filename=null, got ${latestLog.previous_filename}`);
  });

  // Test 8: Public GET /api/payment/qr now streams the active QR code
  await test('Public GET /api/payment/qr now returns 200 with image content', async () => {
    const res = await fetch(`${BASE}/api/payment/qr`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf[0] === 0x89 && buf[1] === 0x50, 'Did not receive valid PNG magic bytes');
  });

  // Test 9: PATCH /api/admin/settings/payment-mode updates mode
  await test('PATCH /api/admin/settings/payment-mode → updates display mode', async () => {
    // Valid: 'qr'
    let res = await adminFetch(`${BASE}/api/admin/settings/payment-mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_display_mode: 'qr' })
    });
    assert(res.ok, `Expected 200, got ${res.status}`);

    let pubRes = await fetch(`${BASE}/api/settings/payment`);
    let pubData = await pubRes.json();
    assert(pubData.payment_display_mode === 'qr', `Expected mode 'qr', got '${pubData.payment_display_mode}'`);
    assert(pubData.qr_image_url === '/api/payment/qr', `Expected qr_image_url='/api/payment/qr', got '${pubData.qr_image_url}'`);

    // Valid: 'both'
    res = await adminFetch(`${BASE}/api/admin/settings/payment-mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_display_mode: 'both' })
    });
    assert(res.ok, `Expected 200, got ${res.status}`);

    pubRes = await fetch(`${BASE}/api/settings/payment`);
    pubData = await pubRes.json();
    assert(pubData.payment_display_mode === 'both', `Expected mode 'both', got '${pubData.payment_display_mode}'`);

    // Invalid mode
    res = await adminFetch(`${BASE}/api/admin/settings/payment-mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_display_mode: 'crypto' })
    });
    assert(res.status === 400, `Expected 400 for invalid mode, got ${res.status}`);
  });

  // Test 10: DELETE /api/admin/settings/qr removes QR and logs removal
  await test('DELETE /api/admin/settings/qr → removes QR and logs audit entry with null new_filename', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/qr`, {
      method: 'DELETE'
    });
    assert(res.ok, `Expected 200, got ${res.status}`);

    // Setting cleared
    const row = db.prepare("SELECT value FROM settings WHERE key = 'qr_image_filename'").get();
    assert(!row, 'Expected qr_image_filename setting to be deleted');

    // Audit log recorded
    const latestLog = db.prepare("SELECT * FROM qr_audit_log ORDER BY id DESC LIMIT 1").get();
    assert(latestLog.previous_filename === uploadedQrFilename, `Expected previous_filename=${uploadedQrFilename}, got ${latestLog.previous_filename}`);
    assert(latestLog.new_filename === null, `Expected new_filename=null, got ${latestLog.new_filename}`);

    // Public GET now returns 404 again
    const qrRes = await fetch(`${BASE}/api/payment/qr`);
    assert(qrRes.status === 404, `Expected 404 after deletion, got ${qrRes.status}`);
  });

  // Reset display mode to 'bank'
  await adminFetch(`${BASE}/api/admin/settings/payment-mode`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_display_mode: 'bank' })
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
