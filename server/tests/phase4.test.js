/**
 * Phase 4 Tests: Bank Statement Parser + SMS Verification
 * Run with: node tests/phase4.test.js
 * Requires server running on port 3001
 */

const db = require('../db');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
const cleanupIds = [];
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
  console.log('\n--- Phase 4 Tests: Statement Parser + SMS Verification ---\n');

  await loginAsAdmin();

  // Test 1: Upload CSV with UTR pattern — structure test
  await test('POST /api/admin/verify/statement with CSV containing UTR pattern → valid structure', async () => {
    const csvContent = 'Date,Description,Amount\n2024-01-15,UPI/CR/123456789012/TestPayer,500\n2024-01-16,NEFT Transfer,1000\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('statement', blob, 'statement.csv');

    const res = await adminFetch(`${BASE}/api/admin/verify/statement`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    assert(typeof data.total_in_statement === 'number', `Expected total_in_statement number, got ${typeof data.total_in_statement}`);
    assert(typeof data.matched === 'number', `Expected matched number, got ${typeof data.matched}`);
    assert(Array.isArray(data.results), 'Expected results array');
  });

  // Test 2: Insert registration, upload CSV with matching UTR → expect status MATCHED but verified = 0, then bulk approve
  await test('Upload CSV matching existing registration UTR → verified via bulk-approve', async () => {
    // Insert a registration
    const info = db.prepare(`
      INSERT INTO registrations (name, department, year, team_selected, utr_number, verified)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run('Statement Test User', 'CSE', '2nd', 'Technical', '999988887777');
    cleanupIds.push(info.lastInsertRowid);

    const csvContent = 'Date,Description,Credit\n2024-01-15,UPI/CR/999988887777/SomeUser,200\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('statement', blob, 'bank.csv');

    const res = await adminFetch(`${BASE}/api/admin/verify/statement`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    assert(data.matched >= 1, `Expected matched >= 1, got ${data.matched}`);
    
    // Check it's in the results with MATCHED status
    const matchRow = data.results.find(r => r.id === info.lastInsertRowid);
    assert(matchRow, 'Expected matchRow to be present');
    assert(matchRow.status === 'MATCHED', `Expected status MATCHED, got ${matchRow.status}`);

    // Confirm it's still unverified in DB
    let row = db.prepare('SELECT verified FROM registrations WHERE id = ?').get(info.lastInsertRowid);
    assert(row.verified === 0, `Expected verified=0, got ${row.verified}`);

    // Bulk approve
    const approveRes = await adminFetch(`${BASE}/api/admin/verify/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [info.lastInsertRowid] })
    });
    const approveData = await approveRes.json();
    assert(approveData.success === true, 'Expected bulk approval success');

    // Confirm verified in DB now
    row = db.prepare('SELECT verified FROM registrations WHERE id = ?').get(info.lastInsertRowid);
    assert(row.verified === 1, `Expected verified=1, got ${row.verified}`);
  });

  // Test 3: SMS verify with matching registration
  await test('POST /api/admin/verify/sms with matching UTR → success', async () => {
    // Insert a registration
    const info = db.prepare(`
      INSERT INTO registrations (name, department, year, team_selected, utr_number, verified)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run('SMS Test User', 'ECE', '3rd', 'Design', '999988887776');
    cleanupIds.push(info.lastInsertRowid);

    const res = await adminFetch(`${BASE}/api/admin/verify/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sms_text: 'Rs. 200 credited. UPI Ref No 999988887776' })
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(data.matched_name === 'SMS Test User', `Expected 'SMS Test User', got '${data.matched_name}'`);
  });

  // Test 4: SMS with no valid UTR
  await test('POST /api/admin/verify/sms with no UTR → fail', async () => {
    const res = await adminFetch(`${BASE}/api/admin/verify/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sms_text: 'Your account balance is Rs. 5000.' })
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Cleanup
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
