/**
 * Phase 2 Tests: Registration API Endpoints
 * Run with: node tests/phase2.test.js
 * Requires server running on port 3001
 */

const db = require('../db');

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

// Helper to create a minimal PNG buffer
function createDummyPNG() {
  // Minimal valid PNG: 1x1 pixel, red
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  return header;
}

async function run() {
  console.log('\n--- Phase 2 Tests: Registration API Endpoints ---\n');

  // Test 1: Valid registration with screenshot
  await test('POST /api/register with all valid fields + screenshot', async () => {
    const formData = new FormData();
    formData.append('name', 'Test User Phase2');
    formData.append('department', 'CSE');
    formData.append('year', '2nd');
    formData.append('team_selected', 'Technical');
    formData.append('email', 'test@example.com');
    formData.append('phone', '9876543210');
    formData.append('utr_number', '111122223333');

    const pngBuffer = createDummyPNG();
    const blob = new Blob([pngBuffer], { type: 'image/png' });
    formData.append('screenshot', blob, 'test.png');

    const res = await fetch(`${BASE}/api/register`, { method: 'POST', body: formData });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(typeof data.id === 'number', `Expected numeric id, got ${data.id}`);
    cleanupIds.push(data.id);
  });

  // Test 2: Missing utr_number
  await test('POST /api/register with missing utr_number → fail', async () => {
    const formData = new FormData();
    formData.append('name', 'Test User');
    formData.append('department', 'CSE');
    formData.append('year', '2nd');
    formData.append('team_selected', 'Technical');

    const pngBuffer = createDummyPNG();
    const blob = new Blob([pngBuffer], { type: 'image/png' });
    formData.append('screenshot', blob, 'test.png');

    const res = await fetch(`${BASE}/api/register`, { method: 'POST', body: formData });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 3: Invalid UTR (not 12 digits)
  await test('POST /api/register with utr_number = "12345" → fail', async () => {
    const formData = new FormData();
    formData.append('name', 'Test User');
    formData.append('department', 'CSE');
    formData.append('year', '2nd');
    formData.append('team_selected', 'Technical');
    formData.append('utr_number', '12345');

    const pngBuffer = createDummyPNG();
    const blob = new Blob([pngBuffer], { type: 'image/png' });
    formData.append('screenshot', blob, 'test.png');

    const res = await fetch(`${BASE}/api/register`, { method: 'POST', body: formData });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 4: GET /api/settings/qr
  await test('GET /api/settings/qr → has qr_url key', async () => {
    const res = await fetch(`${BASE}/api/settings/qr`);
    const data = await res.json();
    assert('qr_url' in data, `Expected response to have qr_url key, got ${JSON.stringify(data)}`);
  });

  // Cleanup
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
