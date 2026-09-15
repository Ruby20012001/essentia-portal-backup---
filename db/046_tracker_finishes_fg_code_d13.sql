-- =====================================================================
-- 046 — WIO → PIO TRACKER · FINISHES AND FG CODE AT D-13
--
--   Follows db/045, on the same marked-up countdown (rev A). Checked against
--   the picture with Monica, 2026-09-15, who confirmed the senior's changes
--   stand as drawn:
--
--   1. Finishes → D-13. The markup at D-9: "After finishes, we need final SLDs
--      for client approvals. It takes 4 days to create an SLD." With the Final
--      SLD due at D-9 (db/045), finishes must be in four days earlier.
--
--   2. FG code → D-13, ahead of the Final SLD. D-13 "Three inputs assembled"
--      ticks "Approved BOQ with FG codes" — the codes are an input to the SLD,
--      not a step after it.
--
--   NOT changed, as confirmed: Client sign-off stays a separate stage at D-2.
--
--   Chain after this file:
--     Archive pass 14 · SLD · Design 10 · SLD · Architecture 10 · Finishes 13
--     · FG code 13 · Final SLD 9 · SLD approvals 6 · Client sign-off 2 · PIO 0
--
--   Finishes and FG code keep their places after the two SLD stages: the
--   markup moves their days, not the order of those three. A row moving on
--   from SLD to Finishes therefore meets an earlier deadline — which is the
--   point: finishes are due before the SLD work that follows them.
--
--   Idempotent, keyed on the OLD values, so a later retune on Setup is never
--   overwritten. No WIO changes stage.
--
--   NOTE: db/045 must not be re-run after this file — its step 7 sets the
--   rev-A positions and would put FG code back after the Final SLD.
--
--   ROLLBACK: UPDATE ee.tracker_stages SET done_by = 9 WHERE stage = 'Finishes';
--             UPDATE ee.tracker_stages SET done_by = 3 WHERE stage = 'FG code';
--             then swap the positions of 'FG code' and 'Final SLD' back.
-- =====================================================================

UPDATE ee.tracker_stages
   SET done_by = 13, updated_at = NOW()
 WHERE stage = 'Finishes' AND done_by = 9;

UPDATE ee.tracker_stages
   SET done_by = 13, updated_at = NOW()
 WHERE stage = 'FG code' AND done_by = 3;

-- FG code ahead of the Final SLD. Swapped only while FG code still sits after
-- it, so a re-run (or a later reorder) is left alone. `position` is UNIQUE, so
-- one row is parked first.
DO $$
DECLARE
  fg_pos  INTEGER;
  sld_pos INTEGER;
BEGIN
  SELECT position INTO fg_pos  FROM ee.tracker_stages WHERE stage = 'FG code';
  SELECT position INTO sld_pos FROM ee.tracker_stages WHERE stage = 'Final SLD';
  IF fg_pos IS NOT NULL AND sld_pos IS NOT NULL AND fg_pos > sld_pos THEN
    UPDATE ee.tracker_stages SET position = -1, updated_at = NOW() WHERE stage = 'FG code';
    UPDATE ee.tracker_stages SET position = fg_pos, updated_at = NOW() WHERE stage = 'Final SLD';
    UPDATE ee.tracker_stages SET position = sld_pos, updated_at = NOW() WHERE stage = 'FG code';
  END IF;
END $$;
