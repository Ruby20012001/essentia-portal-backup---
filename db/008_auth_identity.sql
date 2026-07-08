-- =====================================================================
-- 008 — AUTHENTICATION & IDENTITY (Platform Phase 1)
-- Real session management: production auth is Microsoft Entra ID (OIDC);
-- a local password provider backs development and break-glass access.
-- The DEV_USER_ID env stub is retired — in production the portal depends
-- entirely on the sessions created here.
-- Password hashing is done in Node (scrypt) — pgcrypto is not in PGlite
-- and we don't want DB-side hashing anyway.
-- =====================================================================

-- Identity columns on the existing users table.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash  TEXT,           -- scrypt: salthex:keyhex (local provider only)
  ADD COLUMN IF NOT EXISTS auth_provider  VARCHAR(20) DEFAULT 'entra'
      CHECK (auth_provider IN ('entra','local')),
  ADD COLUMN IF NOT EXISTS mfa_enrolled   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret     TEXT,           -- reserved; MFA-ready, not yet enforced
  ADD COLUMN IF NOT EXISTS failed_logins  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until   TIMESTAMPTZ;

-- =====================================================================
-- SESSIONS — server-side, revocable, timeout- and device-aware.
-- The cookie holds an opaque random token; only its SHA-256 is stored,
-- so a database leak does not yield usable session tokens.
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal.sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,                     -- sha256(raw token)
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'local',
  -- Device / origin tracking
  user_agent    TEXT,
  ip_address    INET,
  device_label  VARCHAR(120),
  -- Lifecycle
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,                     -- absolute timeout
  revoked_at    TIMESTAMPTZ,
  revoked_reason VARCHAR(40)                              -- logout | expired | idle | concurrent | admin
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON portal.sessions (user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_token ON portal.sessions (token_hash);

-- =====================================================================
-- AUTH CONFIGURATION — timeouts and rules as data (config system)
-- =====================================================================
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('auth.provider', '"local"', 'auth',
   'Active auth provider: entra (production) | local (dev/break-glass). Entra activates when tenant env is set.'),
  ('auth.session_absolute_minutes', '480', 'auth',
   'Absolute session lifetime (8h) — a session cannot outlive this regardless of activity.'),
  ('auth.session_idle_minutes', '60', 'auth',
   'Idle timeout — a session with no request for this long is revoked on next use.'),
  ('auth.max_concurrent_sessions', '3', 'auth',
   'Concurrent active sessions per user; the oldest is revoked past this limit.'),
  ('auth.lockout_threshold', '5', 'auth',
   'Failed logins before a temporary account lock.'),
  ('auth.lockout_minutes', '15', 'auth',
   'Duration of the temporary lock after the threshold is hit.')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- APP-ROLE GRANTS for the new table (db/007 pattern — new tables need
-- their own grant or fenced code hits "permission denied").
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON portal.sessions TO essentia_app;
-- Dev password seed lives in 900_dev_fixtures.sql (never in a migration).
