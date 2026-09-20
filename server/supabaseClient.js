/**
 * Supabase Client — Server-Side Only
 *
 * Uses the SERVICE_ROLE_KEY since this Express server is a trusted backend
 * acting on behalf of all users. The service role key must NEVER be sent to
 * or embedded in the frontend build.
 *
 * Fails to boot if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing,
 * matching the existing fail-to-boot pattern for ADMIN_PASSWORD / SESSION_SECRET.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Boot guards (always enforced, not just production) ──
if (!supabaseUrl || !supabaseUrl.trim()) {
  console.error('FATAL: SUPABASE_URL environment variable is not set or empty. Refusing to start server.');
  process.exit(1);
}
if (!supabaseServiceRoleKey || !supabaseServiceRoleKey.trim()) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY environment variable is not set or empty. Refusing to start server.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = supabase;
