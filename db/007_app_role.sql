-- =====================================================================
-- 007 — APPLICATION ROLE (RLS enforcement hardening)
-- Finding (S4 verification): PostgreSQL skips row-level security for
-- superusers and table owners. If the app's connection user is either,
-- the L0-L3 fencing silently evaporates — policies exist but never run.
-- Fix: a dedicated non-privileged role; withUserContext switches to it
-- with SET LOCAL ROLE inside every fenced transaction, so enforcement is
-- guaranteed regardless of how the connection authenticates.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'essentia_app') THEN
    CREATE ROLE essentia_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, ee, eh, factory, proc, portal, audit TO essentia_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public, ee, eh, factory, proc, portal
  TO essentia_app;

-- The audit trail is insert-only for the app role — no UPDATE/DELETE ever.
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO essentia_app;

-- Document-number generators live on public sequences.
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO essentia_app;

-- NOTE for future migrations: tables created after this file need their own
-- GRANT (or ALTER DEFAULT PRIVILEGES) — a migration that forgets shows up
-- immediately as "permission denied" in any fenced code path.
