-- SpaceUp Vol 8 — Supabase Postgres Schema
-- Translated from SQLite with all security remediation constraints preserved.
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- or via the Supabase CLI: supabase db push

-- ══════════════════════════════════════════════
-- 1. registrations
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS registrations (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  institution   TEXT NOT NULL,
  utr_number    TEXT NOT NULL,
  fee_tier      TEXT,
  screenshot_storage_path TEXT,            -- Supabase Storage object key
  verified      BOOLEAN DEFAULT FALSE,
  flagged       BOOLEAN DEFAULT FALSE,
  payment_status TEXT DEFAULT NULL,
  submitted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Finding 6: Database-level UNIQUE constraint on UTR — must exist
-- independently of the app-level pre-insert check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_utr
  ON registrations(utr_number);

-- ══════════════════════════════════════════════
-- 2. settings (key/value store)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ══════════════════════════════════════════════
-- 3. qr_audit_log
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS qr_audit_log (
  id                    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  changed_at            TIMESTAMPTZ DEFAULT NOW(),
  ip_address            TEXT,
  previous_storage_path TEXT,
  new_storage_path      TEXT
);

-- ══════════════════════════════════════════════
-- 4. session (connect-pg-simple standard schema)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR NOT NULL COLLATE "default",
  "sess"   JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ══════════════════════════════════════════════
-- 5. Row Level Security (RLS) & Grant Hardening
-- ══════════════════════════════════════════════
-- The Express backend exclusively accesses Supabase via the service_role key,
-- which bypasses RLS by design. Enabling RLS and revoking public grants locks down
-- any direct access through Supabase's PostgREST API using the anon key.

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
