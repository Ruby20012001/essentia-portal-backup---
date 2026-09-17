-- =====================================================================
-- 052 — DESIGN ACTIVITY TRACKER · MORNING REMINDERS AND ESCALATION
--
--   Monica, 17 Sep 2026, choosing "reminder aur escalation" to make tracking
--   easier. A tracker nobody opens tracks nothing; this brings it to them.
--
--   Every morning (09:00 IST, Sundays skipped by default):
--     · each designer — what is late on their projects, and what is due
--       today or tomorrow;
--     · the head (Vishakha) — every activity late `escalate_after` days or
--       more, by designer;
--     · one more person (Monica by default) — every activity late
--       `escalate_again_after` days or more.
--   Each goes to the portal's bell (in-app) and, when mail is switched on
--   (BREVO_API_KEY / MAIL_FROM), by email.
--
--   ONE A DAY, PER PERSON, PER KIND. ee.design_reminder_log is both the
--   record of what went and the lock: its UNIQUE (sent_for, kind,
--   recipient_user_id) means a second run the same day — the cron retrying,
--   somebody pressing "send now" — sends nothing twice.
--
--   The design accounts' addresses (design.<name>@essentia.in) may not be
--   mailboxes anyone reads, so a person can carry a notify_email of their own.
--   Blank = the account's address.
--
--   Additive + idempotent.
--   ROLLBACK: DROP TABLE ee.design_reminder_log;
--             ALTER TABLE ee.design_tracker_settings
--               DROP COLUMN reminders_on, DROP COLUMN escalate_after,
--               DROP COLUMN escalate_again_after, DROP COLUMN escalate_again_to,
--               DROP COLUMN skip_sunday;
--             ALTER TABLE ee.design_tracker_people DROP COLUMN notify_email;
--             DELETE FROM portal.event_routes WHERE event_type LIKE 'design.%';
--             DELETE FROM portal.notification_templates WHERE code LIKE 'design_%';
-- =====================================================================

ALTER TABLE ee.design_tracker_settings
  ADD COLUMN IF NOT EXISTS reminders_on          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS escalate_after        INTEGER NOT NULL DEFAULT 3 CHECK (escalate_after >= 1),
  ADD COLUMN IF NOT EXISTS escalate_again_after  INTEGER NOT NULL DEFAULT 7 CHECK (escalate_again_after >= 1),
  ADD COLUMN IF NOT EXISTS escalate_again_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skip_sunday           BOOLEAN NOT NULL DEFAULT TRUE;

-- Monica, where her account exists. Only filled when nobody has chosen yet.
UPDATE ee.design_tracker_settings s
   SET escalate_again_to = u.id
  FROM public.users u
 WHERE s.id = 1 AND s.escalate_again_to IS NULL
   AND lower(u.email) = 'monica@essentia.in';

ALTER TABLE ee.design_tracker_people
  ADD COLUMN IF NOT EXISTS notify_email VARCHAR(255);

CREATE TABLE IF NOT EXISTS ee.design_reminder_log (
  id                 BIGSERIAL PRIMARY KEY,
  sent_for           DATE NOT NULL,
  kind               VARCHAR(12) NOT NULL CHECK (kind IN ('designer', 'head', 'leadership')),
  recipient_user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_name     VARCHAR(200) NOT NULL,
  items              INTEGER NOT NULL,
  email_to           VARCHAR(255),
  email_status       VARCHAR(16) NOT NULL DEFAULT 'pending'
                       CHECK (email_status IN ('pending', 'sent', 'not_configured', 'failed', 'no_address')),
  email_detail       TEXT,
  triggered_by       VARCHAR(20) NOT NULL,          -- 'cron' · 'manual'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sent_for, kind, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS design_reminder_log_recent_idx
  ON ee.design_reminder_log (sent_for DESC);

-- The bell. One generic template each: the service writes the whole title and
-- body, because the list of projects is the message.
INSERT INTO portal.notification_templates
  (code, tier, title_template, body_template, action_url_template, action_label, description) VALUES
  ('design_reminder', 'action_required', '{{title}}', '{{body}}', '/design-tracker', 'Open the tracker',
   'Design Activity Tracker — the morning reminder to a designer'),
  ('design_escalation', 'urgent', '{{title}}', '{{body}}', '/design-tracker', 'Open the tracker',
   'Design Activity Tracker — late activities escalated')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('design.reminder',   'project', 'reminder',   'design_reminder',   'explicit', '["in_app"]', 'action_required'),
  ('design.escalation', 'project', 'escalation', 'design_escalation', 'explicit', '["in_app"]', 'urgent')
ON CONFLICT (event_type) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON ee.design_reminder_log TO essentia_app;
GRANT USAGE, SELECT ON SEQUENCE ee.design_reminder_log_id_seq TO essentia_app;
GRANT UPDATE ON ee.design_tracker_people TO essentia_app;
