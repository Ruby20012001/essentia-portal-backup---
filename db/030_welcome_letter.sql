-- =====================================================================
-- 030 — WELCOME LETTER + THE TL READ GATE (Brief §28 · Velocity Gate 8)
--
--   Gate 8: "Communication Spine live — Welcome Letter within 4hrs of first
--   instalment." Plus the permanent constraint from CLAUDE.md: the TL must
--   scroll to the bottom of the letter before the send button activates.
--
--   portal.communication_spine (db/001) already carries the entire contract:
--        letter_type = 'welcome_letter'   (the enum already lists it)
--        ai_draft / ai_generated_at       the draft and when it appeared
--        scroll_complete                  THE MANDATORY READ GATE
--        reviewed_by / reviewed_at        who read it, and when
--        sent_at                          the send
--   So this migration adds no columns. It adds the three things that were
--   missing to actually run the gate:
--
--   1. The scheduled sweep. The scheduler supports interval/daily only, so
--      this runs hourly and the handler no-ops when there is nothing to draft.
--      Hourly comfortably satisfies a 4-hour promise while keeping the job
--      cheap. Idempotency (one welcome letter per project, ever) lives in the
--      handler's NOT EXISTS guard, exactly like weekly-pulse-draft.
--
--   2. The SLA itself as CONFIGURATION, not a constant in code (ADR-EP-01).
--      comms.welcome_letter_sla_hours = 4. The business retunes the promise
--      with an UPDATE; nobody edits TypeScript to change a service level.
--
--   3. An index for the two hot reads — a project's welcome letter, and the
--      queue of drafts still awaiting the TL.
--
--   Note on honesty (ADR-HS-01): the sweep records when a draft was actually
--   generated. It does NOT back-date ai_generated_at to the payment time, so a
--   letter drafted late reads as late. The breach is computed, never hidden.
--
--   Additive + idempotent. No new table.
--   ROLLBACK: DELETE FROM portal.scheduled_jobs WHERE name='welcome-letter-draft';
--             DELETE FROM portal.app_config WHERE key='comms.welcome_letter_sla_hours';
--             DROP INDEX portal.idx_spine_project_type, portal.idx_spine_awaiting_send;
-- =====================================================================

-- ---------------------------------------------------------------------
-- The clock needs a start time, and there wasn't one.
--   ee.billing_milestones.payment_date is a DATE. A 4-hour promise cannot be
--   measured against a date — every payment would appear to land at midnight,
--   so a letter drafted at 14:00 on the day of payment would read as 14 hours
--   late while one drafted at 03:00 would read as early. The gate would be
--   unmeasurable, which is worse than failing it.
--
--   Adds a nullable timestamp for when the instalment was actually confirmed.
--   Nullable on purpose: historic rows genuinely do not know their hour, and
--   the service falls back to the date, marking the measurement as imprecise
--   rather than inventing a time (ADR-HS-01).
-- ---------------------------------------------------------------------
ALTER TABLE ee.billing_milestones
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN ee.billing_milestones.payment_confirmed_at IS
  'When payment was confirmed, to the hour. Starts the Velocity Gate 8 clock '
  '(Welcome Letter within comms.welcome_letter_sla_hours). NULL on rows that '
  'predate this column — payment_date is then the only evidence and the SLA '
  'measurement is reported as imprecise, never guessed.';

-- ---------------------------------------------------------------------
-- The letter records its own provenance.
--   ee.billing_milestones is RLS-fenced to L0/L1, so computing the SLA by
--   reaching back into billing gives the CRM TL — the person who actually
--   reads and sends the letter — no timing at all on their own board. The
--   promise would be invisible to the one persona who works it.
--
--   So the sweep stamps the trigger onto the letter itself: when the
--   instalment was confirmed, and whether that instant was known to the hour.
--   Anyone who can see the letter can see whether it was on time, without
--   being able to see the money.
-- ---------------------------------------------------------------------
ALTER TABLE portal.communication_spine
  ADD COLUMN IF NOT EXISTS trigger_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trigger_precise BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN portal.communication_spine.trigger_at IS
  'When the event that triggered this letter occurred — for a welcome_letter, '
  'when the first instalment was confirmed. Stamped by the drafting sweep so '
  'the SLA is readable without access to ee.billing_milestones.';

COMMENT ON COLUMN portal.communication_spine.trigger_precise IS
  'FALSE when trigger_at was derived from a DATE and is therefore midnight, '
  'not a real time. The SLA is then reported as imprecise, never as exact.';

INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('welcome-letter-draft',
   'Draft the Welcome Letter for every project whose first instalment is confirmed and which has none yet (Brief §28) — Velocity Gate #8.',
   'interval', '3600', TRUE, 3, 300)
ON CONFLICT (name) DO NOTHING;

-- The promise, as data. 4 hours from confirmed first instalment to draft.
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('comms.welcome_letter_sla_hours', '4', 'communication',
   'Hours allowed between the first instalment being confirmed and the Welcome Letter draft existing (Velocity Gate 8). Business-tunable — never hard-code this.')
ON CONFLICT (key) DO NOTHING;

-- A project's letters by type (the welcome-letter lookup, the pulse lookup).
CREATE INDEX IF NOT EXISTS idx_spine_project_type
  ON portal.communication_spine (project_id, letter_type, created_at DESC);

-- The TL's queue: drafted, not yet sent.
CREATE INDEX IF NOT EXISTS idx_spine_awaiting_send
  ON portal.communication_spine (letter_type, created_at DESC)
  WHERE sent_at IS NULL;
