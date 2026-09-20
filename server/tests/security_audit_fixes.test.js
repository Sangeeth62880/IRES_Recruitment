const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const BASE_URL = 'http://localhost:3001';

async function runTests() {
  console.log('\n--- Security Audit Remediation Test Suite ---\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name} — ${err.message}`);
      failed++;
    }
  }

  // 1. Disallowed extension rejected regardless of valid magic bytes
  await test('Upload rejection: file with disallowed extension (.html) is rejected even with valid PNG magic bytes', async () => {
    // PNG magic bytes followed by HTML/JS payload
    const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const payload = Buffer.concat([pngMagic, Buffer.from('<script>alert("xss")</script>')]);

    const tempFilePath = path.join(__dirname, 'polyglot.html');
    fs.writeFileSync(tempFilePath, payload);

    const fd = new FormData();
    fd.append('name', 'Polyglot Tester');
    fd.append('email', 'polyglot@example.com');
    fd.append('phone', '9876543210');
    fd.append('institution', 'Security Lab');
    fd.append('utr_number', '123412341234');
    fd.append('screenshot', new Blob([fs.readFileSync(tempFilePath)], { type: 'image/png' }), 'polyglot.html');

    const res = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      body: fd,
      headers: {
        'X-Forwarded-For': '10.88.0.1'
      }
    });

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    const data = await res.json();
    assert.strictEqual(res.status, 400, `Expected status 400, got ${res.status}`);
    assert.strictEqual(data.success, false, 'Expected success: false');
    assert(data.error.includes('Only PNG, JPG, and JPEG image files are allowed'), `Unexpected error message: ${data.error}`);
  });

  // 2. Duplicate UTR submission is rejected
  await test('UTR deduplication: duplicate UTR submission is rejected with clear 400 error', async () => {
    const testUtr = '9900' + Date.now().toString().slice(-8);

    // Valid PNG file
    const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);

    function createFormData() {
      const fd = new FormData();
      fd.append('name', 'Duplicate Tester');
      fd.append('email', 'duplicate@example.com');
      fd.append('phone', '9876543210');
      fd.append('institution', 'Testing Institute');
      fd.append('utr_number', testUtr);
      fd.append('screenshot', new Blob([validPng], { type: 'image/png' }), 'receipt.png');
      return fd;
    }

    // First submission - should succeed
    const res1 = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      body: createFormData(),
      headers: { 'X-Forwarded-For': '10.88.0.2' }
    });
    const data1 = await res1.json();
    assert.strictEqual(res1.status, 200, `Expected first submission status 200, got ${res1.status}`);
    assert.strictEqual(data1.success, true, 'First registration should succeed');

    // Second submission with exact same UTR - should be rejected with 400
    const res2 = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      body: createFormData(),
      headers: { 'X-Forwarded-For': '10.88.0.3' }
    });
    const data2 = await res2.json();
    assert.strictEqual(res2.status, 400, `Expected duplicate submission status 400, got ${res2.status}`);
    assert.strictEqual(data2.success, false, 'Duplicate registration should fail');
    assert.strictEqual(data2.error, 'This UTR number has already been registered');

    // Clean up inserted test registration
    db.prepare('DELETE FROM registrations WHERE utr_number = ?').run(testUtr);
  });

  // 3. Session ID changes after a successful admin login (Session Fixation Prevention)
  await test('Session fixation: session ID changes after successful admin login', async () => {
    // Step A: First login to obtain an active session cookie
    const login1 = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '10.88.0.4'
      },
      body: JSON.stringify({ password: 'admin123' })
    });

    assert.strictEqual(login1.status, 200, `Initial login expected status 200, got ${login1.status}`);
    const cookies1 = login1.headers.getSetCookie ? login1.headers.getSetCookie() : [];
    const sidCookie1 = cookies1.find(c => c.startsWith('connect.sid='));
    assert(sidCookie1, 'Expected initial connect.sid cookie from server');
    const preLoginSid = sidCookie1.split(';')[0];

    // Step B: Submit login presenting that existing session cookie
    const login2 = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': preLoginSid,
        'X-Forwarded-For': '10.88.0.4'
      },
      body: JSON.stringify({ password: 'admin123' })
    });

    assert.strictEqual(login2.status, 200, `Second login expected status 200, got ${login2.status}`);
    const cookies2 = login2.headers.getSetCookie ? login2.headers.getSetCookie() : [];
    const sidCookie2 = cookies2.find(c => c.startsWith('connect.sid='));
    assert(sidCookie2, 'Expected new connect.sid cookie after successful re-login');
    const postLoginSid = sidCookie2.split(';')[0];

    assert.notStrictEqual(preLoginSid, postLoginSid, `Session ID should regenerate after login! Pre: ${preLoginSid}, Post: ${postLoginSid}`);
  });

  // 4. Logout without a valid CSRF token is rejected
  await test('Admin logout: rejected without valid CSRF token, succeeds with CSRF token', async () => {
    // Log in to obtain valid authenticated session
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '10.88.0.5'
      },
      body: JSON.stringify({ password: 'admin123' })
    });

    const loginData = await loginRes.json();
    assert(loginData.csrfToken, 'Missing csrfToken in login response');
    const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    // Attempt logout WITHOUT CSRF token
    const unauthLogout = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'X-Forwarded-For': '10.88.0.5'
      }
    });

    assert.strictEqual(unauthLogout.status, 403, `Expected status 403 without CSRF token, got ${unauthLogout.status}`);
    const unauthData = await unauthLogout.json();
    assert.strictEqual(unauthData.error, 'Invalid or missing CSRF token');

    // Attempt logout WITH valid CSRF token
    const authLogout = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'X-CSRF-Token': loginData.csrfToken,
        'X-Forwarded-For': '10.88.0.5'
      }
    });

    assert.strictEqual(authLogout.status, 200, `Expected status 200 with valid CSRF token, got ${authLogout.status}`);
    const authData = await authLogout.json();
    assert.strictEqual(authData.success, true);
  });

  // 5. CSV export correctly neutralizes values starting with '='
  await test('CSV export: formula injection triggers (=, +, -, @) are prepended with single quote', async () => {
    // Insert attendee with formula injection in name and institution
    const formulaUtr = '8888' + Date.now().toString().slice(-8);
    const formulaName = '=cmd|\' /C calc\'!A0';
    const formulaInst = '@SUM(1+1)*cmd';

    db.prepare(`
      INSERT INTO registrations (name, email, phone, institution, utr_number, fee_tier)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(formulaName, 'formula@test.com', '9876543210', formulaInst, formulaUtr, 'regular');

    // Login as admin
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '10.88.0.6'
      },
      body: JSON.stringify({ password: 'admin123' })
    });

    const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    // Request CSV export
    const csvRes = await fetch(`${BASE_URL}/api/admin/export/csv`, {
      headers: {
        'Cookie': cookieHeader,
        'X-Forwarded-For': '10.88.0.6'
      }
    });

    assert.strictEqual(csvRes.status, 200, `Expected CSV export status 200, got ${csvRes.status}`);
    const csvText = await csvRes.text();

    // Verify sanitized representation: must contain '=cmd| and '@SUM
    assert(csvText.includes("'=cmd|"), 'CSV should neutralize = formula with leading single quote');
    assert(csvText.includes("'@SUM"), 'CSV should neutralize @ formula with leading single quote');

    // Clean up inserted formula registration
    db.prepare('DELETE FROM registrations WHERE utr_number = ?').run(formulaUtr);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  if (failed > 0) process.exit(1);
}

runTests();
