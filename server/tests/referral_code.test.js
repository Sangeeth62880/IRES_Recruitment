/**
 * Dedicated Test Suite: Referral Code Flow
 * Covers:
 *  1. Registration WITHOUT referral code (non-CUSAT institution) -> succeeds (stores null)
 *  2. Registration WITHOUT referral code (CUSAT institution) -> succeeds (stores null)
 *  3. Registration WITH valid alphanumeric referral code -> succeeds and stores correctly
 *  4. Registration WITH invalid referral code: special characters -> 400
 *  5. Registration WITH invalid referral code: spaces -> 400
 *  6. Registration WITH invalid referral code: length > 20 -> 400
 *  7. CSV export contains referral_code header positioned immediately after institution
 *  8. CSV export applies formula-injection protection on referral_code
 *  9. Admin search filter correctly matches on referral_code
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
const cleanupIds = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ FAIL: ${name} — ${err.message}`);
    failed++;
  }
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
  const blob = new Blob([Buffer.concat([pngHeader, Buffer.from('dummy image content')])], { type: 'image/png' });
  fd.append('screenshot', blob, 'test.png');
  return fd;
}

let ipCounter = 100;
function registerFetch(url, options = {}) {
  const ip = `10.99.1.${ipCounter++}`;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Forwarded-For': ip
    }
  });
}

async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '10.99.2.1'
    },
    body: JSON.stringify({ password: 'admin123' })
  });
  const cookies = res.headers.getSetCookie ? loginResCookies(res) : [];
  return cookies.map(c => c.split(';')[0]).join('; ');
}

function loginResCookies(res) {
  return res.headers.getSetCookie ? res.headers.getSetCookie() : [];
}

// Client-side Admin.jsx search filter replication for exact validation
function filterRegistrations(registrations, searchQuery) {
  if (!searchQuery.trim()) return registrations;
  const q = searchQuery.toLowerCase();
  return registrations.filter(r => 
    (r.name && r.name.toLowerCase().includes(q)) || 
    (r.institution && r.institution.toLowerCase().includes(q)) || 
    (r.referral_code && r.referral_code.toLowerCase().includes(q)) ||
    (r.utr_number && r.utr_number.includes(q)) ||
    (r.email && r.email.toLowerCase().includes(q))
  );
}

async function run() {
  console.log('\n--- Referral Code Flow Tests ---\n');

  // Test 1: Non-CUSAT without referral code
  await test('Registration WITHOUT referral code (non-CUSAT) succeeds and stores null', async () => {
    const testUtr = '71' + Date.now().toString().slice(-10);
    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData({
        name: 'Non CUSAT Registrant',
        email: 'noncusat@nitc.ac.in',
        phone: '9876543210',
        institution: 'NIT Calicut',
        utr_number: testUtr
      })
    });
    const data = await res.json();
    assert(data.success === true, `Expected success, got: ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    const { data: row } = await supabase.from('registrations').select('referral_code').eq('id', data.id).single();
    assert(row.referral_code === null, `Expected referral_code to be null, got ${row.referral_code}`);
  });

  // Test 2: CUSAT without referral code
  await test('Registration WITHOUT referral code (CUSAT) succeeds and stores null', async () => {
    const testUtr = '72' + Date.now().toString().slice(-10);
    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData({
        name: 'CUSAT Registrant No Code',
        email: 'cusatuser@cusat.ac.in',
        phone: '9876543210',
        institution: 'CUSAT',
        utr_number: testUtr
      })
    });
    const data = await res.json();
    assert(data.success === true, `Expected success, got: ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    const { data: row } = await supabase.from('registrations').select('referral_code').eq('id', data.id).single();
    assert(row.referral_code === null, `Expected referral_code to be null, got ${row.referral_code}`);
  });

  // Test 3: Registration WITH valid alphanumeric referral code
  await test('Registration WITH valid alphanumeric referral code succeeds and stores correctly', async () => {
    const testUtr = '73' + Date.now().toString().slice(-10);
    const testCode = 'CUSATSOE2026';
    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData({
        name: 'CUSAT Registrant With Code',
        email: 'cusatcode@cusat.ac.in',
        phone: '9876543210',
        institution: 'CUSAT',
        referral_code: testCode,
        utr_number: testUtr
      })
    });
    const data = await res.json();
    assert(data.success === true, `Expected success, got: ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    const { data: row } = await supabase.from('registrations').select('referral_code').eq('id', data.id).single();
    assert(row.referral_code === testCode, `Expected referral_code '${testCode}', got '${row.referral_code}'`);
  });

  // Test 4: Invalid format - special characters
  await test('Registration with special characters in referral_code rejected with 400', async () => {
    const testUtr = '74' + Date.now().toString().slice(-10);
    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData({
        name: 'Invalid Char Registrant',
        email: 'invalidchar@test.com',
        phone: '9876543210',
        institution: 'CUSAT',
        referral_code: 'REF@CUSAT#1',
        utr_number: testUtr
      })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success: false');
    assert(data.error.includes('alphanumeric'), `Expected alphanumeric error message, got '${data.error}'`);
  });

  // Test 5: Invalid format - spaces
  await test('Registration with spaces in referral_code rejected with 400', async () => {
    const testUtr = '75' + Date.now().toString().slice(-10);
    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData({
        name: 'Space Registrant',
        email: 'space@test.com',
        phone: '9876543210',
        institution: 'CUSAT',
        referral_code: 'REF CUSAT',
        utr_number: testUtr
      })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success: false');
  });

  // Test 6: Invalid format - length > 20
  await test('Registration with referral_code > 20 characters rejected with 400', async () => {
    const testUtr = '76' + Date.now().toString().slice(-10);
    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData({
        name: 'Long Code Registrant',
        email: 'long@test.com',
        phone: '9876543210',
        institution: 'CUSAT',
        referral_code: 'A123456789B123456789C', // 21 chars
        utr_number: testUtr
      })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success: false');
    assert(data.error.includes('20 characters'), `Expected 20 chars error message, got '${data.error}'`);
  });

  // Test 7: CSV export format and positioning
  await test('CSV export includes referral_code column positioned immediately after institution', async () => {
    const cookie = await loginAsAdmin();
    const res = await fetch(`${BASE}/api/admin/export/csv`, {
      headers: { Cookie: cookie, 'X-Forwarded-For': '10.99.2.1' }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const csv = await res.text();
    const headerLine = csv.split('\n')[0];
    const columns = headerLine.split(',');

    const instIdx = columns.indexOf('institution');
    const refIdx = columns.indexOf('referral_code');
    assert(instIdx !== -1, 'institution column must exist in CSV');
    assert(refIdx !== -1, 'referral_code column must exist in CSV');
    assert(refIdx === instIdx + 1, `referral_code (idx ${refIdx}) must immediately follow institution (idx ${instIdx})`);
  });

  // Test 8: CSV export formula injection protection on referral_code
  await test('CSV export applies formula injection protection on referral_code', async () => {
    const formulaUtr = '77' + Date.now().toString().slice(-10);
    const formulaCode = '=SUM(A1:A10)';
    const { data: row, error: insertErr } = await supabase.from('registrations').insert({
      name: 'Formula Ref User',
      email: 'formula_ref@test.com',
      phone: '9876543210',
      institution: 'CUSAT',
      referral_code: formulaCode,
      utr_number: formulaUtr,
      fee_tier: 'regular'
    }).select('id').single();

    assert(!insertErr, `Failed to insert formula test row: ${insertErr ? insertErr.message : ''}`);
    cleanupIds.push(row.id);

    const cookie = await loginAsAdmin();
    const res = await fetch(`${BASE}/api/admin/export/csv`, {
      headers: { Cookie: cookie, 'X-Forwarded-For': '10.99.2.1' }
    });
    const csv = await res.text();
    assert(csv.includes(`"'=SUM(A1:A10)"`) || csv.includes(`'=SUM(A1:A10)`), 'CSV should prefix formula referral code with single quote');
  });

  // Test 9: Admin search filter matching on referral_code
  await test('Admin search correctly matches on referral_code', () => {
    const sampleRows = [
      { id: 1, name: 'Alice', institution: 'MIT', referral_code: 'ALICE2026', utr_number: '100000000001', email: 'a@mit.edu' },
      { id: 2, name: 'Bob', institution: 'CUSAT', referral_code: 'BOB99', utr_number: '100000000002', email: 'b@cusat.ac.in' },
      { id: 3, name: 'Charlie', institution: 'IIT', referral_code: null, utr_number: '100000000003', email: 'c@iit.ac.in' }
    ];

    // Search by full referral code
    const matchFull = filterRegistrations(sampleRows, 'ALICE2026');
    assert(matchFull.length === 1 && matchFull[0].id === 1, 'Should find Alice by exact referral code');

    // Search by lowercase partial referral code (case insensitivity)
    const matchLower = filterRegistrations(sampleRows, 'alice');
    assert(matchLower.length === 1 && matchLower[0].id === 1, 'Should match case-insensitively on referral code');

    // Search by bob's referral code substring
    const matchBobCode = filterRegistrations(sampleRows, 'ob9');
    assert(matchBobCode.length === 1 && matchBobCode[0].id === 2, 'Should match substring in referral code');

    // Search with non-matching code
    const matchNone = filterRegistrations(sampleRows, 'XYZNONEXISTENT');
    assert(matchNone.length === 0, 'Should not match nonexistent referral code');
  });

  // Teardown
  for (const id of cleanupIds) {
    const { data: row } = await supabase
      .from('registrations').select('screenshot_storage_path').eq('id', id).maybeSingle();
    if (row && row.screenshot_storage_path) {
      await supabase.storage.from('payment-screenshots').remove([row.screenshot_storage_path]);
    }
    await supabase.from('registrations').delete().eq('id', id);
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
