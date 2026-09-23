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

-- Creating the role is not the same as being allowed to become it. SET LOCAL
-- ROLE needs the connecting user to be a MEMBER of essentia_app, and from
-- PostgreSQL 16 the membership carries a separate SET option that grants are
-- not given by default. Neon hands neondb_owner a membership with SET false,
-- so withUserContext died on "permission denied to set role" against a real
-- managed database while working perfectly on PGlite — where the connecting
-- user is a superuser and never needs the membership at all.
--
-- EXECUTE format() rather than a plain GRANT because "WITH SET TRUE" is a
-- syntax error before 16: inside a string that branch is never parsed there.
-- NOTE: no PostgreSQL 15 is available anywhere in this project (Neon is 18.6,
-- PGlite is 18.3), so the 15 branch below has never been run. Treat it as
-- untested if you ever point this at one.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 160000 THEN
    EXECUTE format('GRANT essentia_app TO %I WITH SET TRUE', current_user);
  ELSE
    EXECUTE format('GRANT essentia_app TO %I', current_user);
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
