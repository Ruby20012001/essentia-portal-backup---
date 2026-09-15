-- =====================================================================
-- 047 — WIO → PIO TRACKER · ALARM 2, ESCALATED TO HARDESH SIR
--
--   Source: the marked-up countdown (rev A), D-10:
--     printed   "D-10  Selection appointment — hard deadline"
--               "Client attends. Physical samples, inside the tier. Every
--                selection signed on the day."
--               "ALARM 2 — appointment not held …"
--     in red    "Escalation to Hardesh sir as well."
--   and the sheet's own definition: "An alarm is not a reminder — it is a
--   record that the window is now at risk and who put it there."
--   Asked for by Monica, 2026-09-15 ("esc Hardesh sir bhi bnao").
--
--   So the alarm is a RECORD ON THE BOARD, derived like every other status:
--   a running WIO whose selection appointment is not recorded by the end of
--   D-10 reads "ALARM 2 · escalated to Hardesh sir" (wio-tracker-logic.ts).
--   The one fact the board did not carry is whether the appointment happened;
--   this column is that fact.
--
--   Deliberately NOT here: sending email. An automatic message to the CEO is
--   not something to switch on as a side effect of a column.
--
--   Additive + idempotent.
--   ROLLBACK: ALTER TABLE ee.tracker_wios DROP COLUMN selection_held;
-- =====================================================================

ALTER TABLE ee.tracker_wios
  ADD COLUMN IF NOT EXISTS selection_held DATE;

COMMENT ON COLUMN ee.tracker_wios.selection_held IS
  'The day the client selection appointment was held. Hard deadline D-10 '
  '(countdown rev A); not held by then raises ALARM 2, escalated to Hardesh '
  'sir. NULL = not recorded. Whether it was on time is derived, never stored.';
