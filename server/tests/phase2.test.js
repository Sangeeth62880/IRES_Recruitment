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

async function run() {
  console.log('\n--- Phase 2 Tests: Registration API Endpoints ---\n');

  // Test 1: Valid registration
  await test('POST /api/register with all valid fields', async () => {
    const payload = {
      name: 'Test User Phase2',
      department: 'CSE',
      year: '2nd',
      team_selected: 'Technical',
      email: 'test@example.com',
      phone: '9876543210',
      utr_number: '111122223333'
    };

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(typeof data.id === 'number', `Expected numeric id, got ${data.id}`);
    cleanupIds.push(data.id);
  });

  // Test 2: Missing utr_number
  await test('POST /api/register with missing utr_number → fail', async () => {
    const payload = {
      name: 'Test User',
      department: 'CSE',
      year: '2nd',
      team_selected: 'Technical'
    };

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 3: Invalid UTR (not 12 digits)
  await test('POST /api/register with utr_number = "12345" → fail', async () => {
    const payload = {
      name: 'Test User',
      department: 'CSE',
      year: '2nd',
      team_selected: 'Technical',
      utr_number: '12345'
    };

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 4: Valid registration with a valid team_selected
  await test('POST /api/register with valid team_selected (Technical)', async () => {
    const payload = {
      name: 'Test Team User',
      department: 'CSE',
      year: '2nd',
      team_selected: 'Technical',
      utr_number: '222233334444'
    };

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    assert(typeof data.id === 'number', `Expected numeric id, got ${data.id}`);
    cleanupIds.push(data.id);
    
    // Check db entry
    const row = db.prepare('SELECT team_selected FROM registrations WHERE id = ?').get(data.id);
    assert(row && row.team_selected === 'Technical', `Expected team_selected='Technical', got '${row ? row.team_selected : 'none'}'`);
  });

  // Test 5: Invalid registration with an invalid team_selected -> fail
  await test('POST /api/register with invalid team_selected (InvalidTeam) -> fail', async () => {
    const payload = {
      name: 'Test Team User Invalid',
      department: 'CSE',
      year: '2nd',
      team_selected: 'InvalidTeam',
      utr_number: '333344445555'
    };

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert(data.success === false, `Expected success=false, got ${JSON.stringify(data)}`);
  });

  // Test 6: Valid registration with empty team_selected -> defaults to General
  await test('POST /api/register with empty team_selected -> defaults to General', async () => {
    const payload = {
      name: 'Test Team User Empty',
      department: 'CSE',
      year: '2nd',
      team_selected: '',
      utr_number: '444455556666'
    };

    const res = await fetch(`${BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert(data.success === true, `Expected success=true, got ${JSON.stringify(data)}`);
    cleanupIds.push(data.id);

    // Check db entry
    const row = db.prepare('SELECT team_selected FROM registrations WHERE id = ?').get(data.id);
    assert(row && row.team_selected === 'General', `Expected team_selected='General', got '${row ? row.team_selected : 'none'}'`);
  });

  // Cleanup
  for (const id of cleanupIds) {
    db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  }

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
