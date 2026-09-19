-- =====================================================================
-- 053 — DESIGN TRACKER · ONE LINK PER PERSON
--
--   Monica, 19 Sep 2026: "baki sabke alag alag portal banao concept deck ki
--   tarah, unke me bas unhi ka data ho". The design team does not sign in to
--   anything else; asking them for a password to tick their own work off was
--   the thing that stopped the tracker being used. Each of the five gets a
--   link instead, the way each deck is a link.
--
--   WHAT A LINK IS. A long random secret, issued for exactly one person on
--   ee.design_tracker_people. Opening it signs the holder in AS THAT PERSON
--   and as nobody else — so what they can do is what their own account can
--   do, decided by the tracker's own rules (scope "own" for the four, read
--   for the head), not by the link. The link is a way through the door, not
--   a second set of keys.
--
--   WHAT IS STORED IS THE HASH, not the secret — the same treatment as a
--   session token (portal.sessions.token_hash). A copy of this table does
--   not yield a working link, and the secret exists only in the link itself.
--
--   THE RISK, SAID PLAINLY. Anyone holding a designer's link can tick her
--   work off as her. That is the trade Monica chose, twice, for an internal
--   board whose worst case is a wrong tick that shows in the activity feed
--   with her name on it and can be untucked. revoked_at is here so that a
--   link that goes astray can be killed without touching the account: run
--   db/mint-design-links.mjs again and the old one stops working.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE ee.design_tracker_links;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.design_tracker_links (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id    UUID NOT NULL REFERENCES ee.design_tracker_people(id) ON DELETE CASCADE,
  -- sha256 of the secret, hex. Never the secret itself.
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES public.users(id),
  last_used_at TIMESTAMPTZ,
  -- Set to retire a link. Kept rather than deleted so the audit trail still
  -- has something to point at when asked which link was in use.
  revoked_at   TIMESTAMPTZ
);

-- One live link per person is the whole idea: the answer to "what is my link"
-- has to be a single thing. Retired rows keep their history and are ignored.
CREATE UNIQUE INDEX IF NOT EXISTS design_tracker_links_one_live
  ON ee.design_tracker_links (person_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS design_tracker_links_lookup
  ON ee.design_tracker_links (token_hash)
  WHERE revoked_at IS NULL;

-- ── the app role ──────────────────────────────────────────────────────
-- db/007's grant covers only the tables that existed then (see db/044).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'essentia_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ee.design_tracker_links TO essentia_app;
  END IF;
END $$;
