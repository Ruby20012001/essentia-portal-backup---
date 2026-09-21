-- =====================================================================
-- 054 — CONCEPT DECKS · THE HEAD READS, THE FOUR DRAW
--
--   Monica, 21 Sep 2026: "in 4 ke deck me edit ka option daal do, except
--   Vishakha."
--
--   db/043 put all five on ee.concept_deck_editors, which was right when
--   the decks were the only thing the design team had in the portal. The
--   tracker has since settled into a shape that says the same thing twice
--   over: the four do the work and record it, and Vishakha reads what they
--   did. Her board carries no Add, no Remove and no tick. A pen on the
--   decks was the last place the two disagreed.
--
--   So the head comes off the editors list. NOTHING ELSE CHANGES for her:
--   /decks is still on her menu and still hers to open, every deck still
--   opens, and the tool still exports. She can see all of it and change
--   none of it — the tracker's arrangement, applied to the decks.
--
--   Matched by role on ee.design_tracker_people rather than by the name
--   Vishakha, so this stays true of whoever holds the post.
--
--   Additive + idempotent.
--   ROLLBACK: re-run db/043's INSERT INTO ee.concept_deck_editors.
-- =====================================================================

DELETE FROM ee.concept_deck_editors e
 USING ee.design_tracker_people p
 WHERE p.role = 'head'
   AND p.user_id = e.user_id;

-- The four must still be there, or this has quietly taken the decks away
-- from the people whose decks they are.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n
    FROM ee.concept_deck_editors e
    JOIN ee.design_tracker_people p ON p.user_id = e.user_id
   WHERE p.role = 'designer' AND p.is_active;
  IF n < 4 THEN
    RAISE EXCEPTION 'Expected the four designers to keep deck editing, found %.', n;
  END IF;
END $$;
