-- SpaceUp Vol 8 — Supabase Postgres Schema Migration 002
-- Add Referral Code Column to registrations table
-- Nullable TEXT column, optional for registrants (specifically CUSAT students)

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS referral_code TEXT;
