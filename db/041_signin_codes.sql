-- =====================================================================
-- 041 — SIGN-IN CODES (the OTP the team asked for)
--
--   Ruby, 2026-09-03: sign in with a code sent to the person's email rather
--   than a password they have to remember.
--
--   This also retires "forgot password" before it is built. Someone who cannot
--   remember their password asks for a code, signs in, and sets a new one from
--   their own menu. Two routes to the same place is two places to get the
--   security wrong; one route does the whole job.
--
--   WHAT IS STORED. Never the code — its SHA-256, exactly as portal.sessions
--   stores only the hash of a session token (db/008). A database leak must not
--   hand anybody a working way in, and a six-digit code is guessable enough
--   that storing it in the clear would be worse than a password.
--
--   HOW IT CANNOT BE ABUSED, and where each guard lives:
--     · expires_at — ten minutes. A code left in an inbox overnight is not a
--       standing key to the portal.
--     · consumed_at — one use. Verified once, it is spent, so a forwarded mail
--       is worth nothing.
--     · attempts — five wrong guesses and the code dies. Six digits is a
--       million possibilities and a patient script would find one; the ceiling
--       is what makes the short code safe.
--     · One live code per email — issuing a new one revokes the old, so asking
--       twice cannot leave two valid codes in circulation.
--
--   The e-mail address is stored rather than a user id ON PURPOSE: a request
--   for a code must look identical whether or not the account exists, or the
--   endpoint becomes a way to discover who works here.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE portal.login_codes;
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.login_codes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        VARCHAR(255) NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  ip_address   INET
);

-- The lookup every verification makes: the live code for this address.
CREATE INDEX IF NOT EXISTS idx_login_codes_live
  ON portal.login_codes (lower(email), expires_at DESC)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

COMMENT ON COLUMN portal.login_codes.code_hash IS
  'SHA-256 of the six digits. The code itself is never stored — a leak of this '
  'table must not be a way in (same rule as portal.sessions.token_hash).';
COMMENT ON COLUMN portal.login_codes.email IS
  'The address asked for, not a user id. A request must look the same whether '
  'or not the account exists, or this becomes a staff directory.';

-- db/007 pattern: a table created later needs its own grant, or every fenced
-- code path meets "permission denied".
GRANT SELECT, INSERT, UPDATE, DELETE ON portal.login_codes TO essentia_app;

INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('auth.code_minutes', '10', 'auth',
   'How long a sign-in code stays valid. Long enough for a slow mailbox, short '
   'enough that a code left in an inbox is not a standing key.'),
  ('auth.code_max_attempts', '5', 'auth',
   'Wrong guesses before a code is dead. Six digits is a million possibilities; '
   'this ceiling is what makes a short code safe.')
ON CONFLICT (key) DO NOTHING;
