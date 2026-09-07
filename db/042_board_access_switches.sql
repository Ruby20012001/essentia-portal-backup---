-- 042 · Who may reach the board, as two rows rather than two deploys.
--
-- Ruby, 2026-09-07: "sirf whi login krk otp se khole" — only the fourteen
-- people she named should be able to open the tracker, and only the six should
-- be able to change it. The second half has been true since db/038; this is
-- the first half.
--
-- WHY CONFIG AND NOT ENVIRONMENT. Vercel binds environment variables at build
-- time, and this project has spent whole days unable to build (the free plan
-- allows a hundred deployments a day and this one is spent). A door you can only
-- shut by deploying is a door you cannot shut. These are read through
-- portal.app_config, so closing the board is an UPDATE that takes effect
-- within the config cache's thirty seconds.
--
-- WHY BOTH START OPEN. Sign-in codes cannot be delivered yet: essentia.in
-- publishes a DMARC policy and Brevo has not been given the DNS records to
-- satisfy it, so it refuses to send from the domain at all. Flipping either of
-- these to false before that is fixed would lock out every one of the fourteen
-- — they have no passwords, by design. They flip the day the codes arrive.
--
--   board.public       false → /board sends a stranger to sign in
--   auth.self_signup   false → a code request for an unknown address makes
--                              no account, whatever domain it is on
--
-- Neither touches who may WRITE. That is db/038 and db/039, resolved from
-- public.permissions on every request, and no row here can widen it.

INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('board.public', 'true', 'auth',
   'Whether /board opens for anyone holding the link. False sends a visitor '
   'without a session to sign in. Read-only either way — this decides who may '
   'look, never who may change.'),
  ('auth.self_signup', 'true', 'auth',
   'Whether a sign-in code for an unknown address on SELF_SIGNUP_DOMAIN '
   'creates a view-only account. False means only accounts that already exist '
   'can receive a code.')
ON CONFLICT (key) DO NOTHING;

-- Both switches must exist and must be boolean: getConfig falls back to open,
-- so a row of the wrong shape would fail open silently.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(key, ', ') INTO bad
    FROM portal.app_config
   WHERE key IN ('board.public', 'auth.self_signup')
     AND jsonb_typeof(value) <> 'boolean';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'access switches must be JSON booleans, these are not: %', bad;
  END IF;

  IF (SELECT count(*) FROM portal.app_config
       WHERE key IN ('board.public', 'auth.self_signup')) <> 2 THEN
    RAISE EXCEPTION 'both access switches must exist';
  END IF;
END $$;
