-- =====================================================================
-- 030 — CONCEPT DECKS IN THE PORTAL (Brief §29 · design room)
--   The deck tool has lived as one offline HTML file: no install, no login,
--   no server. That is right for a laptop and wrong for five designers who
--   have to work on the same deck and know who changed what. This puts the
--   deck itself in the portal, behind the login the tracker already uses,
--   so the name against an edit is the account that made it rather than a
--   name somebody typed.
--
--   The deck's state is stored with every picture stripped out of it — the
--   pictures are rows of their own, addressed by slot, so a deck of thirty
--   renders is thirty small reads instead of one six-megabyte row.
--
--   Nothing here deletes. A deck is archived, never removed; the activity
--   trail is append-only and has no update path. Deck rows carry `version`,
--   which the editor sends back with a save: two people on the same deck get
--   a refusal to overwrite rather than a silent loss.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE ee.concept_deck_activity, ee.concept_deck_editors,
--             ee.concept_deck_images, ee.concept_decks;
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.concept_decks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code   VARCHAR(20),                  -- ED/YY-YY/NNN, once it is known
  name           VARCHAR(200) NOT NULL,
  stage          VARCHAR(10) NOT NULL DEFAULT 'concept'
                   CHECK (stage IN ('concept', 'execution')),
  state          JSONB NOT NULL,               -- the deck, with no picture data in it
  is_archived    BOOLEAN NOT NULL DEFAULT FALSE,
  version        INTEGER NOT NULL DEFAULT 1,   -- bumped on every save
  created_by     UUID REFERENCES public.users(id),
  updated_by     UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS concept_decks_recent_idx
  ON ee.concept_decks (is_archived, updated_at DESC);

-- Every picture the deck holds, one row each. The slot says where it belongs:
--   'logo' · 'plate:0' · 'space:<space id>:img:2' · 'space:<space id>:doc:0'
CREATE TABLE IF NOT EXISTS ee.concept_deck_images (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deck_id        UUID NOT NULL REFERENCES ee.concept_decks(id) ON DELETE CASCADE,
  slot           VARCHAR(120) NOT NULL,
  mime           VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
  bytes          BYTEA NOT NULL,
  width          INTEGER,
  height         INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deck_id, slot)
);

CREATE INDEX IF NOT EXISTS concept_deck_images_deck_idx
  ON ee.concept_deck_images (deck_id);

-- Who did what, and when. The name is not typed: user_id is the account that
-- was signed in. Append-only — there is no path in the code that updates or
-- deletes a row here.
CREATE TABLE IF NOT EXISTS ee.concept_deck_activity (
  id             BIGSERIAL PRIMARY KEY,
  deck_id        UUID NOT NULL REFERENCES ee.concept_decks(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.users(id),
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  what           VARCHAR(60) NOT NULL,         -- 'saved' · 'exported' · 'opened'
  did            TEXT[] NOT NULL DEFAULT '{}'  -- '2 materials marked on kitchen'
);

CREATE INDEX IF NOT EXISTS concept_deck_activity_deck_idx
  ON ee.concept_deck_activity (deck_id, at DESC);

-- Who may edit. Everybody signed in may read a deck; this list may change one.
-- A row here is a person, not a level: the design team is five people and the
-- rule is easier to read as five rows than as a role nobody can enumerate.
CREATE TABLE IF NOT EXISTS ee.concept_deck_editors (
  user_id        UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  added_by       UUID REFERENCES public.users(id),
  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The design team, by the addresses Monica named on 10 Sep 2026. Only the ones
-- that already have a portal account are added; the rest come in when their
-- account does.
INSERT INTO ee.concept_deck_editors (user_id)
SELECT id FROM public.users
WHERE lower(email) IN (
  'design.vishakha@essentia.in',
  'design.akanshamalik@essentia.in',
  'design.ritu@essentia.in',
  'design.lavika@essentia.in',
  'design.jiya@essentia.in',
  'monica@essentia.in'
)
ON CONFLICT (user_id) DO NOTHING;
