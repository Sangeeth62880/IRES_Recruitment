/**
 * Security Remediation Test Suite
 * Run with: node tests/security.test.js
 * Requires server running on port 3001
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
let adminSessionCookie = '';
let adminCsrfToken = '';

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

async function loginAsAdmin(customIp) {
  const headers = { 'Content-Type': 'application/json' };
  if (customIp) headers['X-Forwarded-For'] = customIp;

  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: 'admin123' })
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  if (setCookies && setCookies.length > 0) {
    adminSessionCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  }
  const data = await res.json();
  if (data.csrfToken) {
    adminCsrfToken = data.csrfToken;
  }
  return { res, data };
}

async function run() {
  console.log('\n--- Security Remediation Test Suite ---\n');

  // ── 1. Production Default Password Guard ──
  await test('Production boot check: Server refuses to start without ADMIN_PASSWORD in production', async () => {
    const child = spawnSync('node', ['-e', `
      process.env.NODE_ENV = 'production';
      delete process.env.ADMIN_PASSWORD;
      try {
        require('./index.js');
      } catch (e) {
        process.exit(1);
      }
    `], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });

    assert(child.status !== 0, `Expected server to exit with non-zero in production without ADMIN_PASSWORD, got ${child.status}`);
    const output = child.stdout + child.stderr;
    assert(output.includes('ADMIN_PASSWORD') || output.includes('Refusing to start'), `Expected warning/fatal log about ADMIN_PASSWORD, got: ${output}`);
  });

  // ── 2. Screenshot Route: Unauthenticated Access ──
  await test('Screenshot route: Rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${BASE}/api/admin/screenshots/any_screenshot.png`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // Log in as admin for subsequent tests
  await loginAsAdmin('192.0.2.10');

  // ── 3. Screenshot Route: Path Traversal Defenses ──
  await test('Screenshot route: Rejects path traversal attempt (../) with 400', async () => {
    // Attempt directory traversal with encoded ../
    const res = await fetch(`${BASE}/api/admin/screenshots/..%2F..%2Fdb.js`, {
      headers: { 'Cookie': adminSessionCookie }
    });
    assert(res.status === 400, `Expected 400 on path traversal, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success=false');
  });

  await test('Screenshot route: Rejects path traversal containing backslashes or null bytes with 400', async () => {
    const res = await fetch(`${BASE}/api/admin/screenshots/..%5Cdb.js`, {
      headers: { 'Cookie': adminSessionCookie }
    });
    assert(res.status === 400, `Expected 400 on backslash traversal, got ${res.status}`);
  });

  await test('Screenshot route: Returns signed URL redirect for valid file when authenticated', async () => {
    // Upload a test image to Supabase Storage
    const testFileName = 'sec_test_valid.png';
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);

    await supabase.storage.from('payment-screenshots').upload(testFileName, pngHeader, {
      contentType: 'image/png',
      upsert: true
    });

    try {
      const res = await fetch(`${BASE}/api/admin/screenshots/${testFileName}`, {
        headers: { 'Cookie': adminSessionCookie },
        redirect: 'manual' // Don't follow redirect, just check the 302
      });
      // Should redirect to signed URL (302) or follow through to valid content
      assert(res.status === 302 || res.status === 200, `Expected 302 redirect or 200, got ${res.status}`);
      if (res.status === 302) {
        const location = res.headers.get('location');
        assert(location && location.includes('token='), 'Expected signed URL with token parameter');
      }
    } finally {
      await supabase.storage.from('payment-screenshots').remove([testFileName]);
    }
  });

  // ── 4. File Content Validation (Magic Bytes) ──
  await test('Upload handler: Rejects non-image file with spoofed image mimetype', async () => {
    const fd = new FormData();
    fd.append('name', 'Spoof Attacker');
    fd.append('email', 'attacker@fake.com');
    fd.append('phone', '9998887776');
    fd.append('institution', 'Exploit Corp');
    fd.append('utr_number', '999988887777');

    // Spoofed content: declared as image/png, but actually raw text without PNG magic bytes
    const fakeBlob = new Blob([Buffer.from('<?php echo "malicious script"; ?>')], { type: 'image/png' });
    fd.append('screenshot', fakeBlob, 'malicious.png');

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: {
        'X-Forwarded-For': '198.51.100.42'
      },
      body: fd
    });

    assert(res.status === 400, `Expected 400 for spoofed mimetype, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success=false');
    assert(data.error.includes('not a valid image') || data.error.includes('Only PNG and JPEG'), `Expected image validation error, got: ${data.error}`);
  });

  // ── 5. CSRF Protection on Mutating Admin Requests ──
  await test('CSRF: Mutating request without CSRF token is rejected with 403', async () => {
    const res = await fetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSessionCookie
        // Deliberately omit X-CSRF-Token
      },
      body: JSON.stringify({ early_bird_enabled: false })
    });
    assert(res.status === 403, `Expected 403 without CSRF token, got ${res.status}`);
    const data = await res.json();
    assert(data.error.includes('CSRF'), `Expected CSRF error message, got: ${data.error}`);
  });

  await test('CSRF: Mutating request with invalid CSRF token is rejected with 403', async () => {
    const res = await fetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSessionCookie,
        'X-CSRF-Token': 'totally-invalid-and-forged-token'
      },
      body: JSON.stringify({ early_bird_enabled: false })
    });
    assert(res.status === 403, `Expected 403 with forged CSRF token, got ${res.status}`);
  });

  await test('CSRF: Mutating request with valid CSRF token succeeds with 200', async () => {
    const res = await fetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSessionCookie,
        'X-CSRF-Token': adminCsrfToken
      },
      body: JSON.stringify({ early_bird_enabled: true })
    });
    assert(res.status === 200, `Expected 200 with valid CSRF token, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Expected success=true');
  });

  // ── 6. Login Rate Limiting ──
  await test('Rate Limiting: Exceeding 5 failed admin logins triggers 429 (trust proxy IP)', async () => {
    const randomSubnet = Math.floor(Math.random() * 200) + 10;
    const attackerIp = `203.0.113.${randomSubnet}`; // Unique IP per test run for rate-limit isolation

    // 5 attempts allowed
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${BASE}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': attackerIp
        },
        body: JSON.stringify({ password: 'wrongpassword' })
      });
      assert(res.status === 401, `Attempt ${i} should be 401, got ${res.status}`);
    }

    // 6th attempt must be 429 Too Many Requests
    const resBlocked = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': attackerIp
      },
      body: JSON.stringify({ password: 'wrongpassword' })
    });
    assert(resBlocked.status === 429, `Attempt 6 should be 429 (Rate limited), got ${resBlocked.status}`);
    const dataBlocked = await resBlocked.json();
    assert(dataBlocked.error.includes('Too many login attempts'), `Expected rate limit message, got: ${dataBlocked.error}`);
  });

  // ── 7. Supabase Service Role Key is never leaked in responses ──
  await test('Service role key is not present in any API response', async () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      // Can't test if key isn't available, skip
      return;
    }

    // Check several endpoint responses
    const endpoints = [
      { url: `${BASE}/api/settings/fee`, method: 'GET' },
      { url: `${BASE}/api/settings/bank`, method: 'GET' },
      { url: `${BASE}/api/settings/payment`, method: 'GET' },
    ];

    for (const ep of endpoints) {
      const res = await fetch(ep.url);
      const text = await res.text();
      assert(!text.includes(serviceRoleKey), `Service role key leaked in response from ${ep.url}`);
    }

    // Check admin response
    const adminRes = await fetch(`${BASE}/api/admin/registrations`, {
      headers: { 'Cookie': adminSessionCookie }
    });
    const adminText = await adminRes.text();
    assert(!adminText.includes(serviceRoleKey), 'Service role key leaked in admin registrations response');
  });

  // ── 8. Supabase boot guard ──
  await test('Boot guard: Server refuses to start without SUPABASE_URL', async () => {
    const child = spawnSync('node', ['-e', `
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
      process.env.SESSION_DB_URL = 'fake';
      try {
        require('./supabaseClient.js');
      } catch (e) {
        process.exit(1);
      }
    `], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });

    assert(child.status !== 0, `Expected exit with non-zero without SUPABASE_URL, got ${child.status}`);
    const output = child.stdout + child.stderr;
    assert(output.includes('SUPABASE_URL'), `Expected fatal log about SUPABASE_URL, got: ${output}`);
  });

  // ── 9. Storage Bucket Privacy (Unauthenticated direct object access rejected) ──
  await test('Storage Bucket Privacy: Direct unauthenticated request to bucket object is rejected', async () => {
    const supabaseUrl = process.env.SUPABASE_URL.trim();
    const testProbeName = `probe_${Date.now()}.png`;
    const dummyPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    for (const bucket of ['payment-screenshots', 'qr-codes']) {
      // Upload probe
      await supabase.storage.from(bucket).upload(testProbeName, dummyPng, { contentType: 'image/png' });

      // Direct unauthenticated public URL
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${testProbeName}`;
      const pubRes = await fetch(publicUrl);
      assert(pubRes.status >= 400, `Expected direct unauthenticated access to fail with 4xx, got ${pubRes.status}`);

      // Direct unauthenticated authenticated URL
      const authUrl = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${testProbeName}`;
      const authRes = await fetch(authUrl);
      assert(authRes.status >= 400, `Expected unauthenticated access to authenticated endpoint to fail, got ${authRes.status}`);

      // Clean up
      await supabase.storage.from(bucket).remove([testProbeName]);
    }
  });

  // ── 10. Expired Signed URL Rejected by Supabase Storage ──
  await test('Signed URL: Expired signed URL is cryptographically rejected by Supabase Storage', async () => {
    const testFileName = `test_exp_${Date.now()}.png`;
    const dummyPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    await supabase.storage.from('payment-screenshots').upload(testFileName, dummyPng, { contentType: 'image/png' });

    // Generate signed URL with 1 second TTL
    const { data: signData, error: signErr } = await supabase.storage
      .from('payment-screenshots')
      .createSignedUrl(testFileName, 1);

    assert(!signErr && signData && signData.signedUrl, 'Failed to create 1-second signed URL');
    const fullUrl = signData.signedUrl.startsWith('http')
      ? signData.signedUrl
      : `${process.env.SUPABASE_URL.trim()}/storage/v1${signData.signedUrl}`;

    // Wait 2.2 seconds for expiration
    await new Promise(resolve => setTimeout(resolve, 2200));

    // Request with expired token
    const res = await fetch(fullUrl);
    assert(res.status === 400, `Expected 400 for expired signed URL, got ${res.status}`);
    const body = await res.text();
    assert(body.includes('InvalidJWT') || body.includes('exp'), `Expected InvalidJWT exp error, got: ${body}`);

    await supabase.storage.from('payment-screenshots').remove([testFileName]);
  });

  // ── 11. Cross-Origin CSRF Verification ──
  await test('Cross-Origin CSRF: Mutating cross-origin request without or with wrong CSRF header is rejected', async () => {
    // 1. Cross-origin request without CSRF header
    const resNoToken = await fetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSessionCookie,
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({ early_bird_fee: 300 })
    });
    assert(resNoToken.status === 403, `Expected 403 without CSRF token, got ${resNoToken.status}`);

    // 2. Cross-origin request with forged CSRF header
    const resBadToken = await fetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSessionCookie,
        'Origin': 'http://localhost:5173',
        'X-CSRF-Token': 'forged_fake_token_1234567890'
      },
      body: JSON.stringify({ early_bird_fee: 300 })
    });
    assert(resBadToken.status === 403, `Expected 403 with invalid CSRF token, got ${resBadToken.status}`);

    // 3. Cross-origin request with matching CSRF token
    const resValid = await fetch(`${BASE}/api/admin/settings/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSessionCookie,
        'Origin': 'http://localhost:5173',
        'X-CSRF-Token': adminCsrfToken
      },
      body: JSON.stringify({ early_bird_fee: 299 })
    });
    assert(resValid.status === 200, `Expected 200 with valid CSRF token, got ${resValid.status}`);
  });

  // ── 12. Row Level Security & Anon Isolation ──
  await test('Row Level Security: RLS is enabled on all tables and anon role holds no privileges', async () => {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.SESSION_DB_URL });

    const rlsRes = await pool.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('registrations', 'settings', 'qr_audit_log', 'session')
      ORDER BY tablename;
    `);

    assert(rlsRes.rows.length === 4, `Expected 4 public tables, found ${rlsRes.rows.length}`);
    for (const row of rlsRes.rows) {
      assert(row.rowsecurity === true, `Expected RLS to be enabled on ${row.tablename}, but was false`);
    }

    const grantRes = await pool.query(`
      SELECT grantee, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
    `);
    assert(grantRes.rows.length === 0, `Expected 0 grants for anon/authenticated roles, found ${grantRes.rows.length}`);

    await pool.end();
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
