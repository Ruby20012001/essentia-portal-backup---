-- =====================================================================
-- 048 — WIO → PIO TRACKER · THE LAST THREE, AS THE PICTURE HAS THEM
--
--   Monica, 2026-09-15, after checking the board against the marked-up
--   countdown (rev A): "then make these changes".
--
--   1. Client sign-off → D-6. The markup at D-6: "Mandatory approvals on SLDs
--      — Jyoti, Yogi, Vishakha (if req.), TL, client approval". Client
--      approval closes with the others at D-6. (db/046 left it at D-2 on an
--      earlier instruction; this supersedes that.)
--
--   2. "Vishakha (if req.)". The same note names her as required only when
--      required; the waiting-on text now says so rather than listing her as
--      always holding the stage.
--
--   3. A timeline per WIO. The markup at D-9: "Standard timeline for an SLD &
--      complete project (depending on the scope of work)." The board's window
--      was one number for every WIO. `window_days` lets a WIO carry its own;
--      NULL keeps the board's standard (15). No per-scope numbers are set —
--      the sheet does not give them, and none is invented.
--
--   Idempotent, keyed on the OLD values. No WIO changes stage; no WIO gets a
--   timeline nobody entered.
--   ROLLBACK: UPDATE ee.tracker_stages SET done_by = 2 WHERE stage = 'Client sign-off';
--             UPDATE ee.tracker_stages SET waiting_on = 'Jyoti + Yogi + Vishakha + TL'
--               WHERE stage = 'SLD approvals';
--             ALTER TABLE ee.tracker_wios DROP COLUMN window_days;
-- =====================================================================

UPDATE ee.tracker_stages
   SET done_by = 6, updated_at = NOW()
 WHERE stage = 'Client sign-off' AND done_by = 2;

UPDATE ee.tracker_stages
   SET waiting_on = 'Jyoti + Yogi + Vishakha (if req.) + TL', updated_at = NOW()
 WHERE stage = 'SLD approvals' AND waiting_on = 'Jyoti + Yogi + Vishakha + TL';

ALTER TABLE ee.tracker_wios
  ADD COLUMN IF NOT EXISTS window_days INTEGER
  CHECK (window_days IS NULL OR window_days BETWEEN 1 AND 365);

COMMENT ON COLUMN ee.tracker_wios.window_days IS
  'This WIO''s own WIO → PIO timeline in days, set by scope of work (countdown '
  'rev A, D-9). NULL = the board''s standard window (tracker_settings.window_days).';
