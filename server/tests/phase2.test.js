/**
 * Phase 2 Tests: Registration API Endpoints
 * Run with: node tests/phase2.test.js
 * Requires server running on port 3001
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');

const BASE = 'http://localhost:3001';
let passed = 0;
let failed = 0;
const cleanupIds = [];

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

let reqIndex = 1;
function registerFetch(url, options = {}) {
  const ip = `10.0.1.${reqIndex++}`;
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Forwarded-For': ip
    }
  });
}

async function run() {
  console.log('\n--- Phase 2 Tests: Registration API Endpoints ---\n');

  const pauseKeys = ['registrations_paused', 'pause_message'];
  const { data: initialPauseSettings } = await supabase.from('settings').select('*').in('key', pauseKeys);
  await supabase.from('settings').delete().in('key', pauseKeys);

  try {
  // Test 1: Valid registration with all required fields
  await test('POST /api/register with all valid fields', async () => {
    const payload = {
      name: 'Test User Phase2',
      email: 'test@example.com',
      phone: '9876543210',
      institution: 'CUSAT',
      utr_number: '111122223333'
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(typeof data.id === 'number', `Expected numeric id, got ${data.id}`);
    cleanupIds.push(data.id);

    // Check fee_tier was stored via Supabase client
    const { data: row } = await supabase
      .from('registrations').select('fee_tier').eq('id', data.id).single();
    assert(row && (row.fee_tier === 'early_bird' || row.fee_tier === 'regular'), 
      `Expected fee_tier to be early_bird or regular, got '${row ? row.fee_tier : 'none'}'`);
  });

  // Test 2: Missing utr_number
  await test('POST /api/register with missing utr_number → fail', async () => {
    const payload = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '9876543210',
      institution: 'CUSAT'
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 3: Invalid UTR (not 12 digits)
  await test('POST /api/register with utr_number = "12345" → fail', async () => {
    const payload = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '9876543210',
      institution: 'CUSAT',
      utr_number: '12345'
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 4: Missing institution → fail
  await test('POST /api/register with missing institution → fail', async () => {
    const payload = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '9876543210',
      utr_number: '222233334444'
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 5: Missing email → fail
  await test('POST /api/register with missing email → fail', async () => {
    const payload = {
      name: 'Test User',
      phone: '9876543210',
      institution: 'CUSAT',
      utr_number: '333344445555'
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 6: Missing payment screenshot → fail
  await test('POST /api/register with missing screenshot → fail', async () => {
    const payload = {
      name: 'Test User No Screenshot',
      email: 'test@example.com',
      phone: '9876543210',
      institution: 'CUSAT',
      utr_number: '555566667777'
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload, false)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
    assert(data.error === 'Payment screenshot is required', `Expected 'Payment screenshot is required', got '${data.error}'`);
  });

  // Test 7: GET /api/settings/fee returns fee and tier
  await test('GET /api/settings/fee → returns fee and tier', async () => {
    const res = await fetch(`${BASE}/api/settings/fee`);
    const data = await res.json();
    assert(typeof data.fee === 'number', `Expected numeric fee, got ${data.fee}`);
    assert(data.tier === 'early_bird' || data.tier === 'regular', `Expected tier to be early_bird or regular, got ${data.tier}`);
  });

  // Test 8: Valid registration WITHOUT referral_code (non-CUSAT) succeeds with referral_code = null
  await test('POST /api/register without referral code (non-CUSAT) → succeeds with null', async () => {
    const testUtr = '81' + Date.now().toString().slice(-10);
    const payload = {
      name: 'Non CUSAT User',
      email: 'noncusat@example.com',
      phone: '9876543210',
      institution: 'IIT Madras',
      utr_number: testUtr
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    const { data: row } = await supabase
      .from('registrations').select('referral_code').eq('id', data.id).single();
    assert(row && row.referral_code === null, `Expected referral_code null, got '${row ? row.referral_code : 'none'}'`);
  });

  // Test 9: Valid registration WITHOUT referral_code (CUSAT) succeeds with referral_code = null
  await test('POST /api/register without referral code (CUSAT) → succeeds with null', async () => {
    const testUtr = '82' + Date.now().toString().slice(-10);
    const payload = {
      name: 'CUSAT User No Code',
      email: 'cusatuser@cusat.ac.in',
      phone: '9876543210',
      institution: 'CUSAT',
      utr_number: testUtr
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    const { data: row } = await supabase
      .from('registrations').select('referral_code').eq('id', data.id).single();
    assert(row && row.referral_code === null, `Expected referral_code null, got '${row ? row.referral_code : 'none'}'`);
  });

  // Test 10: Valid registration WITH alphanumeric referral_code succeeds and is stored
  await test('POST /api/register with valid alphanumeric referral code → succeeds and stored', async () => {
    const testUtr = '83' + Date.now().toString().slice(-10);
    const payload = {
      name: 'CUSAT User With Code',
      email: 'cusatcode@cusat.ac.in',
      phone: '9876543210',
      institution: 'CUSAT',
      referral_code: 'CUSAT2026SOE',
      utr_number: testUtr
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    const { data: row } = await supabase
      .from('registrations').select('referral_code').eq('id', data.id).single();
    assert(row && row.referral_code === 'CUSAT2026SOE', `Expected referral_code 'CUSAT2026SOE', got '${row ? row.referral_code : 'none'}'`);
  });

  // Test 11: Invalid referral_code with special characters rejected with 400
  await test('POST /api/register with special characters in referral code → 400', async () => {
    const testUtr = '84' + Date.now().toString().slice(-10);
    const payload = {
      name: 'Invalid Code User',
      email: 'invalid@example.com',
      phone: '9876543210',
      institution: 'CUSAT',
      referral_code: 'CODE@123!',
      utr_number: testUtr
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected failure for special characters in referral code, got ${JSON.stringify(data)}`);
  });

  // Test 12: Invalid referral_code with spaces rejected with 400
  await test('POST /api/register with spaces in referral code → 400', async () => {
    const testUtr = '85' + Date.now().toString().slice(-10);
    const payload = {
      name: 'Invalid Space Code User',
      email: 'invalidspace@example.com',
      phone: '9876543210',
      institution: 'CUSAT',
      referral_code: 'CODE 123',
      utr_number: testUtr
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected failure for spaces in referral code, got ${JSON.stringify(data)}`);
  });

  // Test 13: Invalid referral_code exceeding 20 characters rejected with 400
  await test('POST /api/register with referral code > 20 chars → 400', async () => {
    const testUtr = '86' + Date.now().toString().slice(-10);
    const payload = {
      name: 'Long Code User',
      email: 'longcode@example.com',
      phone: '9876543210',
      institution: 'CUSAT',
      referral_code: '123456789012345678901', // 21 characters
      utr_number: testUtr
    };

    const res = await registerFetch(`${BASE}/api/register`, {
      method: 'POST',
      body: makeFormData(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected failure for referral code > 20 chars, got ${JSON.stringify(data)}`);
  });

  // Cleanup
  for (const id of cleanupIds) {
    // Get screenshot path to clean up from storage
    const { data: row } = await supabase
      .from('registrations').select('screenshot_storage_path').eq('id', id).maybeSingle();
    if (row && row.screenshot_storage_path) {
      await supabase.storage.from('payment-screenshots').remove([row.screenshot_storage_path]);
    }
    await supabase.from('registrations').delete().eq('id', id);
  }

  } finally {
    await supabase.from('settings').delete().in('key', pauseKeys);
    if (initialPauseSettings && initialPauseSettings.length > 0) {
      for (const item of initialPauseSettings) {
        await supabase.from('settings').upsert({ key: item.key, value: item.value });
      }
    }
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
