/**
 * Security Remediation Test Suite
 * Run with: node tests/security.test.js
 * Requires server running on port 3001
 */

const path = require('path');
const fs = require('fs');
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

  await test('Screenshot route: Successfully streams valid file when authenticated', async () => {
    // Create temporary test image file in screenshots directory
    const screenshotsDir = path.join(__dirname, '..', 'data', 'uploads', 'screenshots');
    const testFileName = 'sec_test_valid.png';
    const testFilePath = path.join(screenshotsDir, testFileName);
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    fs.writeFileSync(testFilePath, pngHeader);

    try {
      const res = await fetch(`${BASE}/api/admin/screenshots/${testFileName}`, {
        headers: { 'Cookie': adminSessionCookie }
      });
      assert(res.ok, `Expected 200, got ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      assert(buf[0] === 0x89 && buf[1] === 0x50, 'Did not receive valid file content');
    } finally {
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
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

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
