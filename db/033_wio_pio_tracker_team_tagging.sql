-- =====================================================================
-- 033 — WIO → PIO TRACKER · TAG THE BOARD BY TEAM
--
--   Source: Ruby's daily standup, 2026-08-31, which reports the two teams
--   SEPARATELY and so partitions the board explicitly. Checked before use:
--   the two lists share no WIO number — the partition has no contradictions.
--
--   THIS CORRECTS AN EARLIER MISREADING, recorded here because it changed a
--   decision. db/032's header said the supplied WIO-to-PIO-Tracker_neeraj.xlsx
--   was "a copy of the same sheet, not Neeraj's board", because its 15 rows are
--   the first 15 of the 37-row export in identical order with identical values.
--   The comparison was right; the conclusion drawn from it was wrong. The
--   standup shows 11 of those 15 are Neeraj's and NOT ONE is Dipmallya's. The
--   real explanation is that the 37-row export is the COMBINED board with
--   Neeraj's rows listed first — so that file was Neeraj's slice all along.
--
--   Declining to seed it was still correct: its rows were already on the board,
--   so importing would have duplicated them (and the wio_number unique
--   constraint would have refused). The right action was always to TAG, which
--   is what this migration does. No row is created or removed here.
--
--   WHAT IS STATED vs WHAT IS INFERRED — kept separate on purpose:
--
--   STATED (33 rows). Named under a team heading in the standup, or, for the
--   Design Democracy row, matched on scope: the standup lists "DESIGN DEMOCRACY
--   / WARDROBE DRAWING" under Dipmallya, and the board's only Design Democracy
--   row has scope 'Wardrobe'. (Neeraj's separate Design Democracy Hyderabad
--   item is a doll bar, which is not on the board.)
--
--   INFERRED (4 rows) — ED/26-27/086, /111, /097, /015. Absent from today's
--   standup (all three ED/…/086, /111, /097 sit at the PIO stage, so they have
--   most likely moved on), but present in Neeraj's own workbook, which contains
--   ZERO Dipmallya rows. Two are corroborated by project: /086 is Sherly
--   Residence, which is Neeraj's via ED/26-27/130; /111 and /097 are Preeta
--   Goyal, which is Neeraj's via /118 and /129. /015 ("632") has no
--   corroboration beyond the file it came from.
--
--   These four are tagged neeraj rather than left alone because "left alone"
--   is not neutral — db/032 backfilled every row to dipmallya, so leaving them
--   asserts Dipmallya on weaker evidence than tagging them Neeraj. Both are a
--   judgement; this is the better-supported one. It is also cheap to reverse:
--   team is a lens, changeable from the row's Team dropdown, and this file
--   names exactly which four to check.
--
--   NOT APPLIED HERE — needs Ruby, see the report:
--     · 4 WIOs in the standup that are not on the board (ED/26-27/104, /077,
--       /107, /132). Adding them means inventing a stage and a `since`, which
--       are the two fields the whole board derives from.
--     · 3 PIO conversions reported today (ED/26-27/257, /254, /248). Marking a
--       row Released takes it off the clock, and 257 is claimed by both teams
--       for different scopes.
--
--   Additive + idempotent. Re-running re-asserts the same tags.
--   ROLLBACK: UPDATE ee.tracker_wios SET team_code = 'dipmallya';
-- =====================================================================

-- ---------------------------------------------------------------------
-- Neeraj's team — 11 stated + 4 inferred.
-- ---------------------------------------------------------------------
UPDATE ee.tracker_wios SET team_code = 'neeraj', updated_at = NOW()
 WHERE wio_number IN (
   -- Stated: named under "NEERU's SITE" in the 2026-08-31 standup.
   'ED/26-27/089',  -- Residence at Chennai · wardrobes        (TL Nimisha)
   'ED/26-27/090',  -- Anchor / Sumati Kanodia · bar counter   (TL Nimisha)
   'ED/26-27/046',  -- Punjabi Bagh                            (TL Nimisha)
   'ED/26-27/121',  -- Enayat House, Vasant Vihar              (TL Nimisha)
   'ED/26-27/130',  -- Sherly Residence, Chennai               (TL Nimisha)
   'ED/26-27/118',  -- Preeta Goyal                            (TL Rohit)
   'ED/26-27/129',  -- Preeta Goyal Residence · stone handles  (TL Rohit)
   'ED/26-27/092',  -- Residence at Mumbai                     (TL Aparna)
   'ED/26-27/106',  -- Sonali Mittal · dining table            (TL Bhavya)
   'ED/26-27/084',  -- Maharani Bagh                           (TL Bhavya)
   'ED/26-27/083',  -- Ladhani Residence                       (TL Bhavya)
   -- Inferred from Neeraj's workbook (see header). CONFIRM THESE FOUR.
   'ED/26-27/086',  -- Sherly Residence — corroborated by /130
   'ED/26-27/111',  -- Preeta Goyal    — corroborated by /118, /129
   'ED/26-27/097',  -- Preeta Goyal    — corroborated by /118, /129
   'ED/26-27/015'   -- "632" — provenance only, no corroboration
 );

-- ---------------------------------------------------------------------
-- Dipmallya's team — 21 stated by number, plus the Design Democracy row
-- matched on scope. Written as an explicit list rather than "everything
-- else": a row added later must not be silently swept into a team.
-- ---------------------------------------------------------------------
UPDATE ee.tracker_wios SET team_code = 'dipmallya', updated_at = NOW()
 WHERE wio_number IN (
   'ED/25-26/172',  -- M3M · loose furniture 65                (TL Sahil)
   'ED/25-26/173',  -- M3M Trump Tower · sculptures, mirrors   (TL Sahil)
   'ED/26-27/088',  -- Nalin Gupta                             (TL Sahil)
   'ED/26-27/098',  -- 115 (A) · media unit, storage
   'ED/26-27/109',  -- Mehta Residence, DLF Phase 1            (TL Ishaan)
   'ED/26-27/120',  -- Mehta Residence · coffee table
   'ED/26-27/081',  -- Elite Dubai                             (Ishika)
   'ED/26-27/099',  -- Varun Puri                              (Sahil)
   'ED/26-27/018',  -- Panchsheel Park / N44                   (TL Ali)
   'ED/26-27/122',  -- Raghav Karol                            (Ali)
   'ED/26-27/057',  -- Nalin Gupta Residence                   (TL Sahil)
   'ED/26-27/053',  -- 1912A Magnolias                         (TL Sahil)
   'ED/26-27/119',  -- Panchsheel Park · pooja room etc        (TL Ali)
   'ED/26-27/091',  -- 115 (A) · bar counter                   (Sahil)
   'ED/26-27/127',  -- Nagpal Residence · main door            (TL Ali)
   'ED/26-27/128',  -- Nalin Gupta · dining chairs, beds       (TL Sahil)
   'ED/26-27/100',  -- Nalin Gupta · night stands
   'ED/26-27/039',  -- 115 (A) Aralias · loose furniture 41
   'ED/26-27/136',  -- Ridhima Jain Residence · door handles
   'ED/26-27/137',  -- 1912 (A) Magnolias · shoe storage
   'ED/26-27/133',  -- Singhal Residence · loose furniture 20
   -- Matched on scope, not number: this row has no WIO number at all.
   '— no WIO number —'  -- Design Democracy · Wardrobe
 );

-- ---------------------------------------------------------------------
-- Proof, not assumption: every row must now carry a team that the standup
-- or Neeraj's workbook actually supports. If a row were missed it would
-- still read 'dipmallya' from db/032's backfill and nobody would notice,
-- so this fails the migration loudly instead.
-- ---------------------------------------------------------------------
--   Scoped to the 37 rows THIS migration names, not to the whole table: later
--   migrations legitimately add WIOs (db/034 does), and a global count would
--   turn every future addition into a failed re-run of this file.
DO $$
DECLARE
  n_dip INTEGER;
  n_nee INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE team_code = 'dipmallya'),
         COUNT(*) FILTER (WHERE team_code = 'neeraj')
    INTO n_dip, n_nee
    FROM ee.tracker_wios
   WHERE wio_number IN (
     'ED/25-26/172','ED/25-26/173','ED/26-27/088','ED/26-27/098','ED/26-27/109',
     'ED/26-27/120','ED/26-27/081','ED/26-27/099','ED/26-27/018','ED/26-27/122',
     'ED/26-27/057','ED/26-27/053','ED/26-27/119','ED/26-27/091','ED/26-27/127',
     'ED/26-27/128','ED/26-27/100','ED/26-27/039','ED/26-27/136','ED/26-27/137',
     'ED/26-27/133','— no WIO number —',
     'ED/26-27/089','ED/26-27/090','ED/26-27/046','ED/26-27/121','ED/26-27/130',
     'ED/26-27/118','ED/26-27/129','ED/26-27/092','ED/26-27/106','ED/26-27/084',
     'ED/26-27/083','ED/26-27/086','ED/26-27/111','ED/26-27/097','ED/26-27/015'
   );

  IF n_dip <> 22 OR n_nee <> 15 THEN
    RAISE EXCEPTION
      'Team tagging is off: expected 22 dipmallya / 15 neeraj across the 37 rows '
      'this migration names, got % / %. A seeded WIO was renamed or removed — '
      'tag it explicitly rather than letting it inherit a team.', n_dip, n_nee;
  END IF;
END $$;
