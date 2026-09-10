-- =====================================================================
-- 044 — CONCEPT DECKS · THE APP ROLE MAY ACTUALLY READ THEM
--
--   db/007 grants essentia_app rights over ALL TABLES IN SCHEMA — which means
--   the tables that existed when 007 ran. Every table made since has needed its
--   own grant (008 for sessions, 009 for sync runs, 041 for login codes), and
--   042 forgot to. The page then failed the only way it could: the app connects
--   as the owner, sets role essentia_app, and Postgres refuses the read.
--
--   The rights are the ones the code actually uses, and no more:
--     · decks       read, make, change — never delete; archiving is an update
--     · images      read, write, replace, remove — a picture swapped out is
--                   gone, and the deck's own history is not kept in these rows
--     · activity    read and append. No update, no delete: a trail that can be
--                   edited is not a trail
--     · editors     read only. Who may change a deck is decided by a person
--                   running a migration, not by the running application
--
--   Additive + idempotent.
--   ROLLBACK: REVOKE ALL ON ee.concept_decks, ee.concept_deck_images,
--             ee.concept_deck_activity, ee.concept_deck_editors FROM essentia_app;
-- =====================================================================

GRANT SELECT, INSERT, UPDATE ON ee.concept_decks TO essentia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ee.concept_deck_images TO essentia_app;
GRANT SELECT, INSERT ON ee.concept_deck_activity TO essentia_app;
GRANT SELECT ON ee.concept_deck_editors TO essentia_app;

-- concept_deck_activity.id is BIGSERIAL; without the sequence an insert fails
-- with a message about the sequence, not the table, which sends you looking in
-- the wrong place.
GRANT USAGE, SELECT ON SEQUENCE ee.concept_deck_activity_id_seq TO essentia_app;
