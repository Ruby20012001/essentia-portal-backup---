-- =====================================================================
-- 045 — WIO → PIO TRACKER · THE COUNTDOWN, REV A, AS MARKED UP
--
--   Source: "WIO to PIO — the countdown. Fifteen days, counted backwards"
--   (17 August 2026 · rev A · the WIO & PIO desk), printed and marked up in
--   red by Monica, 2026-09-15, and confirmed by her ("do it accordingly",
--   then "9 we need final SLD").
--
--   What the markup changes ON THE BOARD:
--
--   1. GFC is gone. D-5 GFC production, D-4 GFC freeze and D-3 signatures are
--      crossed out: "These 3 days can be taken in the SLD preparation bcoz we
--      haven't taken SLD time." The GFC stage leaves the chain.
--
--   2. BOM is gone. "No need of BOM for PIO. BOM will be made after the PIO is
--      released." The BOM stage leaves the chain. Its one running row,
--      ED/25-26/172 ("BOM in process with Parul, then Tanisha raises the PIO"),
--      moves to PIO — the step its own note names next.
--
--   3. A Final SLD stage, due at D-9. "After finishes, we need final SLDs for
--      client approvals. It takes 4 days to create an SLD." — and, confirmed:
--      "9 we need final SLD".
--
--   4. Sign-off becomes SLD approvals, due at D-6 ("Approvals close"), held by
--      the approvers the markup names as mandatory: "Jyoti, Yogi, Vishakha
--      (if req.), TL". Khushpreet is crossed off the circulation list, and
--      "Yogi sir will verify all drawings instead of Khushpreet sir". Client
--      approval keeps its own stage after it. The stage keeps its id, so the
--      rows sitting at Sign-off stay exactly where they are.
--
--   5. FG code keeps its place, between the Final SLD and the approvals, at
--      D-3. The markup does not move it, so neither does this file.
--
--   6. The drawing team acknowledges a WIO within 24 hours ("Drawing team must
--      acknowledge the WIO within 24 hours"). A date column, not a status: the
--      state is derived in wio-tracker-logic.ts like everything else.
--
--   What it does NOT change, on purpose:
--     - Finishes stays at D-9. Read literally, a 4-day SLD after finishes puts
--       Finishes earlier; nobody said which day, so none is invented.
--     - The 15-day window and the D-14 Archive pass. "No decline for WIO, and
--       no checklist" (Hardesh sir) removes nothing the board carries.
--     - Escalation to Hardesh sir, and a timeline that varies with scope. Both
--       are new behaviour, not a retune, and wait for their own decisions.
--     - Delay reasons. "BOM · In process too long" and "Sign-off · …" stay:
--       logged delays reference them, and history is not rewritten.
--
--   Idempotent. Re-running changes nothing, and never overwrites a later retune
--   made on the Setup screen (every UPDATE is keyed on the OLD value).
--
--   ROLLBACK (the pre-change rows were exported before this ran on live):
--     restore ee.tracker_stages; UPDATE ee.tracker_wios SET stage_id = <BOM id>
--       WHERE wio_number = 'ED/25-26/172';
--     ALTER TABLE ee.tracker_wios DROP COLUMN acknowledged;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 6. The 24-hour acknowledgement.
-- ---------------------------------------------------------------------
ALTER TABLE ee.tracker_wios
  ADD COLUMN IF NOT EXISTS acknowledged DATE;

COMMENT ON COLUMN ee.tracker_wios.acknowledged IS
  'The day the drawing team acknowledged this WIO. Due within 24 hours of '
  'wio_issued (countdown rev A). NULL = not recorded. Whether it was on time '
  'is derived, never stored.';

-- ---------------------------------------------------------------------
-- 3. Final SLD. Inserted at a parking position; step 7 puts it in place.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_stages (position, stage, waiting_on, done_by)
SELECT 1000, 'Final SLD', 'Design team', 9
WHERE NOT EXISTS (SELECT 1 FROM ee.tracker_stages WHERE stage = 'Final SLD');

-- ---------------------------------------------------------------------
-- 4. Sign-off → SLD approvals. Same row, same id — its WIOs do not move.
-- ---------------------------------------------------------------------
UPDATE ee.tracker_stages
   SET stage = 'SLD approvals',
       waiting_on = 'Jyoti + Yogi + Vishakha + TL',
       done_by = 6,
       updated_at = NOW()
 WHERE stage = 'Sign-off';

-- ---------------------------------------------------------------------
-- 1 + 2. Move rows off the stages leaving the chain, saying so on the row.
--   `since` is kept: the row has been waiting since then, and re-stamping it
--   would rewrite how long. The note records that the move was the chain's,
--   not a person's.
-- ---------------------------------------------------------------------
UPDATE ee.tracker_wios w
   SET stage_id = (SELECT id FROM ee.tracker_stages WHERE stage = 'PIO'),
       notes = concat_ws(' ', w.notes,
         '[15 Sep: moved from BOM — BOM is now made after the PIO is released.]'),
       updated_at = NOW()
  FROM ee.tracker_stages s
 WHERE s.id = w.stage_id AND s.stage = 'BOM';

UPDATE ee.tracker_wios w
   SET stage_id = (SELECT id FROM ee.tracker_stages WHERE stage = 'Final SLD'),
       notes = concat_ws(' ', w.notes,
         '[15 Sep: moved from GFC — GFC days now go to SLD preparation.]'),
       updated_at = NOW()
  FROM ee.tracker_stages s
 WHERE s.id = w.stage_id AND s.stage = 'GFC';

-- Only once nothing points at them. The FK would refuse anyway; the guard
-- makes a re-run a no-op instead of an error.
DELETE FROM ee.tracker_stages st
 WHERE st.stage IN ('GFC', 'BOM')
   AND NOT EXISTS (SELECT 1 FROM ee.tracker_wios w WHERE w.stage_id = st.id);

-- ---------------------------------------------------------------------
-- 7. The new order. `position` is UNIQUE, so everything is parked above the
--    range first and then set. A stage not named here (one added later on
--    Setup) keeps its relative place after these nine rather than colliding.
-- ---------------------------------------------------------------------
UPDATE ee.tracker_stages SET position = position + 10000 WHERE position < 10000;

UPDATE ee.tracker_stages st
   SET position = v.pos
  FROM (VALUES
    ('Archive pass',        1),
    ('SLD · Design',        2),
    ('SLD · Architecture',  3),
    ('Finishes',            4),
    ('Final SLD',           5),
    ('FG code',             6),
    ('SLD approvals',       7),
    ('Client sign-off',     8),
    ('PIO',                 9)
  ) AS v(stage, pos)
 WHERE st.stage = v.stage;

UPDATE ee.tracker_stages st
   SET position = ranked.n
  FROM (SELECT id, 9 + ROW_NUMBER() OVER (ORDER BY position) AS n
          FROM ee.tracker_stages WHERE position >= 10000) AS ranked
 WHERE st.id = ranked.id;
