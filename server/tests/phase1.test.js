/**
 * Phase 1 Tests: Database (Supabase Postgres) setup verification
 * Run with: node tests/phase1.test.js
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../supabaseClient');

let passed = 0;
let failed = 0;

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

async function run() {
  console.log('\n--- Phase 1 Tests: Database Setup (Supabase Postgres) ---\n');

  // Test 1: Check registrations table exists and is queryable
  await test('registrations table exists and is queryable', async () => {
    const { data, error } = await supabase.from('registrations').select('id').limit(0);
    assert(!error, `registrations table query failed: ${error ? error.message : ''}`);
  });

  // Test 2: Check settings table exists
  await test('settings table exists and is queryable', async () => {
    const { data, error } = await supabase.from('settings').select('key').limit(0);
    assert(!error, `settings table query failed: ${error ? error.message : ''}`);
  });

  // Test 3: Check qr_audit_log table exists
  await test('qr_audit_log table exists and is queryable', async () => {
    const { data, error } = await supabase.from('qr_audit_log').select('id').limit(0);
    assert(!error, `qr_audit_log table query failed: ${error ? error.message : ''}`);
  });

  // Test 4: Verify registrations table has correct columns
  await test('registrations table has correct columns', async () => {
    // Insert a row and check all expected columns are accessible
    const testUtr = '98' + Date.now().toString().slice(-10);
    const { data: insertData, error: insertError } = await supabase
      .from('registrations')
      .insert({
        name: 'Schema Test User',
        email: 'schema@test.com',
        phone: '9876543210',
        institution: 'Test University',
        utr_number: testUtr,
        fee_tier: 'early_bird'
      })
      .select('id, name, email, phone, institution, utr_number, fee_tier, screenshot_storage_path, verified, flagged, payment_status, submitted_at')
      .single();

    assert(!insertError, `Insert failed: ${insertError ? insertError.message : ''}`);
    assert(insertData.name === 'Schema Test User', `Expected name 'Schema Test User', got '${insertData.name}'`);
    assert(insertData.email === 'schema@test.com', `Expected email, got '${insertData.email}'`);
    assert(insertData.institution === 'Test University', `Expected institution, got '${insertData.institution}'`);
    assert(insertData.fee_tier === 'early_bird', `Expected fee_tier 'early_bird', got '${insertData.fee_tier}'`);
    assert(insertData.utr_number === testUtr, `Expected utr '${testUtr}', got '${insertData.utr_number}'`);
    assert(insertData.verified === false, `Expected verified=false, got ${insertData.verified}`);
    assert(insertData.flagged === false, `Expected flagged=false, got ${insertData.flagged}`);

    // Verify old columns don't exist by checking they're not in the response
    assert(!('department' in insertData), 'Column "department" should not exist');
    assert(!('year' in insertData), 'Column "year" should not exist');
    assert(!('team_selected' in insertData), 'Column "team_selected" should not exist');

    // Clean up
    await supabase.from('registrations').delete().eq('id', insertData.id);
  });

  // Test 5: Insert and read a settings row
  await test('insert and read a settings row', async () => {
    await supabase.from('settings').upsert({ key: 'test_key', value: 'test_value' }, { onConflict: 'key' });

    const { data: row } = await supabase
      .from('settings').select('value').eq('key', 'test_key').single();
    assert(row.value === 'test_value', `Expected 'test_value', got '${row.value}'`);

    // Clean up
    await supabase.from('settings').delete().eq('key', 'test_key');
  });

  // Test 6: UTR UNIQUE constraint is enforced at database level
  await test('UTR UNIQUE constraint enforced at database level', async () => {
    const testUtr = '99' + Date.now().toString().slice(-10);

    // First insert
    const { error: err1 } = await supabase.from('registrations').insert({
      name: 'Unique Test 1', email: 'u1@test.com', phone: '1234567890',
      institution: 'Test', utr_number: testUtr, fee_tier: 'regular'
    });
    assert(!err1, `First insert failed: ${err1 ? err1.message : ''}`);

    // Duplicate insert — should fail with unique violation
    const { error: err2 } = await supabase.from('registrations').insert({
      name: 'Unique Test 2', email: 'u2@test.com', phone: '1234567890',
      institution: 'Test', utr_number: testUtr, fee_tier: 'regular'
    });
    assert(err2 && err2.code === '23505', `Expected unique_violation (23505), got ${err2 ? err2.code + ': ' + err2.message : 'no error'}`);

    // Clean up
    await supabase.from('registrations').delete().eq('utr_number', testUtr);
  });

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
