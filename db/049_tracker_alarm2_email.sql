-- =====================================================================
-- 049 — WIO → PIO TRACKER · ALARM 2 BY EMAIL, TO HARDESH SIR
--
--   The marked-up countdown (rev A), D-10: "Escalation to Hardesh sir as
--   well." The printed sheet: "The desk raises them on the day, by name, to
--   the person and their department head." Monica, 2026-09-15: "usme likha
--   tha ki Hardesh sir ke paas bhi jayega mail … do it right now."
--
--   db/047 made ALARM 2 a record on the board. This file is what lets it go
--   out as an email: a daily run (frontend/app/api/wio-tracker/alarms/run,
--   called by Vercel Cron) sends ONE email naming every WIO newly escalated,
--   and records the outcome here, per WIO.
--
--   ONE SUCCESSFUL EMAIL PER WIO. A partial unique index allows exactly one
--   'sent' row per WIO per alarm, so a re-run never mails the CEO twice about
--   the same WIO. A 'failed' or 'not_configured' attempt does not count as
--   sent — the next day's run tries again, and the board says what happened.
--
--   KNOWN ON THE DAY THIS WAS WRITTEN: essentia.in publishes a DMARC policy
--   and Brevo has not been authorised in its DNS (see commit 75f617a — not one
--   sign-in code was ever delivered). Until IT adds those records, every
--   attempt will be recorded 'failed' with Brevo's reason, and the Today
--   screen says so in words. Nothing is silently dropped.
--
--   The recipient and the on/off switch are config rows (ADR-EP-01): changing
--   who is mailed, or stopping the mail, is an UPDATE, not a deploy.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE ee.tracker_alarm_emails;
--             DELETE FROM portal.app_config
--              WHERE key IN ('tracker.alarm2.recipient', 'tracker.alarm2.email_enabled');
-- =====================================================================

CREATE TABLE IF NOT EXISTS ee.tracker_alarm_emails (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wio_id      UUID NOT NULL REFERENCES ee.tracker_wios(id) ON DELETE CASCADE,
  alarm       VARCHAR(20) NOT NULL,
  recipient   VARCHAR(200) NOT NULL,
  -- The stamped date the board was read against when the alarm went out.
  board_date  DATE NOT NULL,
  status      VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed', 'not_configured')),
  -- The mail service's own reason on failure, carried so whoever can fix it
  -- sees the cause. Never shown on the public board.
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ee.tracker_alarm_emails IS
  'Every ALARM 2 email attempt, one row per WIO per attempt. At most one '
  '''sent'' row per WIO per alarm — the CEO is mailed once about a WIO.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracker_alarm_emails_sent_once
  ON ee.tracker_alarm_emails (wio_id, alarm)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_tracker_alarm_emails_latest
  ON ee.tracker_alarm_emails (created_at DESC);

INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('tracker.alarm2.recipient', '"hardesh@essentia.in"', 'delivery',
   'Who ALARM 2 (selection appointment not held by D-10) is emailed to. The '
   'marked-up countdown: "Escalation to Hardesh sir as well."'),
  ('tracker.alarm2.email_enabled', 'true', 'delivery',
   'Whether the daily ALARM 2 run sends email at all. false stops it; the alarm '
   'still shows on the board either way.')
ON CONFLICT (key) DO NOTHING;

-- Shape guard: getConfig falls back silently, so a switch of the wrong type
-- would quietly do the wrong thing.
DO $$
BEGIN
  IF (SELECT jsonb_typeof(value) FROM portal.app_config
       WHERE key = 'tracker.alarm2.email_enabled') <> 'boolean' THEN
    RAISE EXCEPTION 'tracker.alarm2.email_enabled must be a JSON boolean';
  END IF;
  IF (SELECT jsonb_typeof(value) FROM portal.app_config
       WHERE key = 'tracker.alarm2.recipient') <> 'string' THEN
    RAISE EXCEPTION 'tracker.alarm2.recipient must be a JSON string';
  END IF;
END $$;
