/**
 * Registration Pause & Gateway Control API Tests
 * Run with: node tests/registration_pause.test.js
 * Requires server running on port 3001
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');

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

let ipCounter = 200;
async function loginAsAdmin() {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.99.0.${ipCounter++}` },
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
      'X-Forwarded-For': `10.99.0.${ipCounter++}`,
      'Cookie': sessionCookie,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    }
  });
}

function makeFormData(payload, includeScreenshot = true) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      fd.append(key, String(value));
    }
  }
  if (includeScreenshot) {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const blob = new Blob([Buffer.concat([pngHeader, Buffer.from('dummy image content')])], { type: 'image/png' });
    fd.append('screenshot', blob, 'test.png');
  }
  return fd;
}

async function run() {
  console.log('\n--- Registration Pause & Gateway Control Tests ---\n');

  const pauseKeys = ['registrations_paused', 'pause_message'];
  const { data: initialSettings } = await supabase.from('settings').select('*').in('key', pauseKeys);

  // Ensure unpaused for start of test
  await supabase.from('settings').delete().eq('key', 'registrations_paused');
  await supabase.from('settings').delete().eq('key', 'pause_message');

  try {
  await loginAsAdmin();

  // Test 1: Public endpoint returns unpaused by default
  await test('GET /api/settings/registration-status → returns is_paused: false', async () => {
    const res = await fetch(`${BASE}/api/settings/registration-status`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.is_paused === false, `Expected is_paused: false, got ${data.is_paused}`);
  });

  // Test 2: Admin can toggle pause ON and set custom notice
  await test('PATCH /api/admin/settings/registration-status → pause registrations', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/registration-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_paused: true,
        pause_message: 'Capacity full for Phase 1. Reopening soon!'
      })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Expected success: true');
    assert(data.is_paused === true, 'Expected is_paused: true');
    assert(data.pause_message === 'Capacity full for Phase 1. Reopening soon!', 'Expected updated message');
  });

  // Test 3: Public endpoint now returns is_paused: true with custom message
  await test('GET /api/settings/registration-status → reflects is_paused: true and custom message', async () => {
    const res = await fetch(`${BASE}/api/settings/registration-status`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.is_paused === true, 'Expected is_paused: true');
    assert(data.pause_message === 'Capacity full for Phase 1. Reopening soon!', 'Expected custom pause message');
  });

  // Test 4: POST /api/register is blocked with 403 and the custom message
  await test('POST /api/register when paused → rejected with 403 Forbidden', async () => {
    const fd = makeFormData({
      name: 'Test Paused User',
      email: 'paused@test.com',
      phone: '9876543210',
      institution: 'CUSAT',
      utr_number: '999988887777'
    });
    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': `10.99.1.${ipCounter++}` },
      body: fd
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success: false');
    assert(data.error === 'Capacity full for Phase 1. Reopening soon!', `Expected pause message error, got "${data.error}"`);
  });

  // Test 5: Admin can unpause registrations
  await test('PATCH /api/admin/settings/registration-status → unpause registrations', async () => {
    const res = await adminFetch(`${BASE}/api/admin/settings/registration-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_paused: false })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Expected success: true');
    assert(data.is_paused === false, 'Expected is_paused: false');
  });

  // Test 6: Public endpoint reflects unpaused
  await test('GET /api/settings/registration-status → reflects is_paused: false', async () => {
    const res = await fetch(`${BASE}/api/settings/registration-status`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.is_paused === false, 'Expected is_paused: false');
  });

  } finally {
    // Restore settings table to state before tests ran
    await supabase.from('settings').delete().in('key', pauseKeys);
    if (initialSettings && initialSettings.length > 0) {
      for (const item of initialSettings) {
        await supabase.from('settings').upsert({ key: item.key, value: item.value });
      }
    }
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  if (failed > 0) process.exit(1);
}

run();
