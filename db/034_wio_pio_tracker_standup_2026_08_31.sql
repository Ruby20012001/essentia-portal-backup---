-- =====================================================================
-- 034 — WIO → PIO TRACKER · THE 2026-08-31 STANDUP
--
--   Source: Ruby's standup of 2026-08-31, with every judgement call confirmed
--   by her before this file was written. Nothing here is inferred from prose.
--
--     Q: which row does PIO ED/26-27/257 belong to — the wardrobe or the
--        Design Democracy Hyderabad doll bar?      A: "both are onboard"
--     Q: /254 → ED/26-27/136 and /248 → ED/26-27/018?   A: "both are a yes"
--     Q: the four stages I read out of your text?       A: "all four confirmed"
--
--   TWO THINGS THIS FILE DOES NOT DO, on purpose:
--
--   1. It does not re-stamp the board. ee.tracker_settings.today_stamp is still
--      2026-08-25, so the "PIOs released today" tile will read 0 even though
--      three rows below it say "PIO released". That is stale, not wrong — the
--      stamp is the team's own daily act (Setup screen, one click), and moving
--      everyone's reading date is not a migration's business.
--
--   2. It does not create a row for the Design Democracy Hyderabad doll bar.
--      See the note on that release below.
--
--   Additive + idempotent. Re-running changes nothing.
--   ROLLBACK: DELETE FROM ee.tracker_wios
--               WHERE wio_number IN ('ED/26-27/104','ED/26-27/077',
--                                    'ED/26-27/107','ED/26-27/132');
--             UPDATE ee.tracker_wios SET pio_released = NULL, pio_no = NULL
--               WHERE wio_number IN ('ED/26-27/136','ED/26-27/018',
--                                    '— no WIO number —');
-- =====================================================================

-- ---------------------------------------------------------------------
-- Four WIOs reported in the standup that were not on the board.
--
--   `wio_issued` is left NULL for all four. The standup reports their drawing
--   state, not the date their WIO was issued, and inventing one would start a
--   15-day clock that never really started. They read "Not tracked" until
--   someone enters the real date — the board's own way of asking for it.
--
--   `since` is 2026-08-31: the date we actually know they were at these
--   stages. It is later than the current stamp, so "days here" reads 0 rather
--   than a negative — the derivation clamps it (wio-tracker-logic.ts).
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_wios
  (wio_number, team_code, project, scope, raised_by, wio_issued, stage_id, since, notes)
SELECT v.wio_number, v.team_code, v.project, v.scope, v.raised_by,
       NULL::date, s.id, DATE '2026-08-31', v.notes
FROM (VALUES
  ('ED/26-27/104', 'dipmallya', '1912 A Magnolias', 'Laminate door (servant area) 1 no',
   NULL, 'Client sign-off',
   'Sign-off done. Standup 31 Aug.'),

  ('ED/26-27/077', 'neeraj', 'JS House (Bajaj Capital)', 'Vanities 7 nos',
   'Nimisha', 'SLD · Design',
   'Vanity drawings checked; changes in progress. Standup 31 Aug.'),

  ('ED/26-27/107', 'neeraj', 'Leeford Clinic', 'Vanity + vanity mirror 22 · media unit 8',
   'Nimisha', 'SLD · Design',
   '6 of 22 vanity drawings done; 1 on hold — faucet specification pending. '
   'Sizes exist for 7; the rest need the site, which is not ready. '
   'Media unit 2 of 8 given for sign-off. Standup 31 Aug.'),

  ('ED/26-27/132', 'neeraj', 'Bansal Office', 'Loose furniture 13 · media unit 1',
   'Nimisha', 'Sign-off',
   '6 of 13 loose-furniture drawings shared for sign-off. '
   'Media unit on hold — TV model not finalised. Standup 31 Aug.')
) AS v(wio_number, team_code, project, scope, raised_by, stage, notes)
JOIN ee.tracker_stages s ON s.stage = v.stage
ON CONFLICT (wio_number) DO NOTHING;

-- ---------------------------------------------------------------------
-- Three PIOs converted on 2026-08-31.
--
--   Setting pio_released is what takes a row off the clock: status resolves to
--   "Released", daysLeft becomes n/a rather than a misleading number, and the
--   row scores no urgency. The stage is deliberately left where it stands —
--   moving it would re-stamp `since` and rewrite how long the row actually sat
--   at its last stage, which is history, not status.
-- ---------------------------------------------------------------------

-- ED/26-27/254 · Ridhima Jain Residence.
UPDATE ee.tracker_wios
   SET pio_released = DATE '2026-08-31', pio_no = 'ED/26-27/254', updated_at = NOW()
 WHERE wio_number = 'ED/26-27/136' AND pio_released IS NULL;

-- ED/26-27/248 · Panchsheel Park — the 7 vanity mirrors ("Pio release today").
UPDATE ee.tracker_wios
   SET pio_released = DATE '2026-08-31', pio_no = 'ED/26-27/248', updated_at = NOW()
 WHERE wio_number = 'ED/26-27/018' AND pio_released IS NULL;

-- ED/26-27/257 · Design Democracy.
--
--   Both teams reported this one, for different items — Dipmallya's standup
--   says the wardrobe drawing, Neeraj's says Design Democracy Hyderabad, doll
--   bar 2 nos. Ruby confirmed both are on board, i.e. the single PIO covers
--   both items.
--
--   Only the wardrobe exists as a row here (the board's one Design Democracy
--   entry, which has never had a WIO number). It is marked released against
--   /257. The doll bar is NOT given a row: it has already converted, and
--   creating a WIO row purely to mark it released the same instant would put a
--   line on a WIO→PIO tracker that never spent a day in the WIO→PIO window.
--   If the doll bar should be tracked in its own right, it needs a real WIO
--   number and a real issue date, which is an entry on the WIOs screen and not
--   a guess in a migration.
UPDATE ee.tracker_wios
   SET pio_released = DATE '2026-08-31', pio_no = 'ED/26-27/257', updated_at = NOW()
 WHERE wio_number = '— no WIO number —' AND pio_released IS NULL;

-- ---------------------------------------------------------------------
-- Proof. Four rows added, three released — asserted rather than assumed,
-- because a silently-missed UPDATE here leaves a converted WIO sitting on
-- the clock accruing a lateness it does not deserve.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_new      INTEGER;
  n_released INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_new FROM ee.tracker_wios
   WHERE wio_number IN ('ED/26-27/104','ED/26-27/077','ED/26-27/107','ED/26-27/132');

  SELECT COUNT(*) INTO n_released FROM ee.tracker_wios
   WHERE pio_no IN ('ED/26-27/254','ED/26-27/248','ED/26-27/257')
     AND pio_released = DATE '2026-08-31';

  IF n_new <> 4 THEN
    RAISE EXCEPTION 'Expected the 4 standup WIOs on the board, found %.', n_new;
  END IF;
  IF n_released <> 3 THEN
    RAISE EXCEPTION
      'Expected 3 PIO releases stamped 2026-08-31, found %. A target WIO number '
      'may have changed — a converted WIO left on the clock reads as late.', n_released;
  END IF;
END $$;
