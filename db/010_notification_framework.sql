-- =====================================================================
-- 010 — EVENT-DRIVEN NOTIFICATION FRAMEWORK (Platform Phase 3)
--   Business action → domain event → event bus → notification engine →
--   configured channels. No module sends notifications directly; every
--   module publishes events. Providers are pluggable and config-selected.
-- =====================================================================

-- =====================================================================
-- EVENT STORE — immutable domain events. dedupe_key centralises the
-- "don't fire the same alert twice" logic (e.g. the WIO clock sweep).
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal.events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),   -- event_id
  event_type     VARCHAR(60) NOT NULL,                          -- e.g. 'wio.created'
  category       VARCHAR(20) NOT NULL CHECK (category IN
                 ('workflow','approval','user','project','department','system','ai','integration')),
  entity_type    VARCHAR(50),
  entity_id      UUID,
  entity_ref     VARCHAR(60),                                   -- human ref (ED/26-27/001)
  actor_id       UUID REFERENCES public.users(id),
  department_id  UUID REFERENCES public.departments(id),
  priority       notif_tier NOT NULL DEFAULT 'informational',
  payload        JSONB DEFAULT '{}',
  correlation_id UUID,
  dedupe_key     VARCHAR(200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_dedupe
  ON portal.events (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_type ON portal.events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON portal.events (correlation_id);

-- =====================================================================
-- DELIVERIES — the fan-out + delivery engine. One row per
-- (event × recipient × channel), with retry/backoff/dead-letter state.
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal.notification_deliveries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         UUID NOT NULL REFERENCES portal.events(id) ON DELETE CASCADE,
  recipient_id     UUID NOT NULL REFERENCES public.users(id),
  channel          VARCHAR(20) NOT NULL,                        -- in_app|teams|email|whatsapp|sms|push
  notification_type VARCHAR(40) NOT NULL,                       -- assignment|approval_request|...
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','failed','dead','suppressed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 5,
  next_attempt_at  TIMESTAMPTZ DEFAULT NOW(),
  last_error       TEXT,
  rendered         JSONB,                                       -- snapshot of what was sent
  in_app_id        UUID REFERENCES portal.notifications(id),    -- link to the inbox row
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, recipient_id, channel)                       -- duplicate prevention
);
CREATE INDEX IF NOT EXISTS idx_deliv_due
  ON portal.notification_deliveries (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_deliv_recipient
  ON portal.notification_deliveries (recipient_id, status);

-- =====================================================================
-- EXTEND the in-app inbox to carry event linkage + lifecycle.
-- =====================================================================
ALTER TABLE portal.notifications
  ADD COLUMN IF NOT EXISTS event_id          UUID REFERENCES portal.events(id),
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS category          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS acknowledged_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notif_active
  ON portal.notifications (recipient_id, created_at DESC)
  WHERE archived_at IS NULL;

-- =====================================================================
-- USER PREFERENCES — one row per user; the engine honours these.
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal.notification_preferences (
  user_id           UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  channels          JSONB NOT NULL DEFAULT '{"in_app":true,"email":false,"teams":false}',
  -- Category toggles (approval/escalation/project/department/personal/system/ai)
  category_prefs    JSONB NOT NULL DEFAULT '{}',
  quiet_hours_start TIME,
  quiet_hours_end   TIME,
  digest_frequency  VARCHAR(10) NOT NULL DEFAULT 'none'
                    CHECK (digest_frequency IN ('none','daily','weekly')),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- EVENT ROUTES — event_type → notification wiring (data-driven). The
-- engine reads these; a new event type is a row, not a code change.
-- recipient_strategy ∈ explicit|actor|project_tl|workflow_step_approver|
--                       workflow_started_by
-- =====================================================================
CREATE TABLE IF NOT EXISTS portal.event_routes (
  event_type         VARCHAR(60) PRIMARY KEY,
  category           VARCHAR(20) NOT NULL,
  notification_type  VARCHAR(40) NOT NULL,
  template_code      VARCHAR(50) REFERENCES portal.notification_templates(code),
  recipient_strategy VARCHAR(40) NOT NULL DEFAULT 'explicit',
  default_channels   JSONB NOT NULL DEFAULT '["in_app"]',
  priority           notif_tier NOT NULL DEFAULT 'informational',
  is_active          BOOLEAN DEFAULT TRUE
);

-- Templates the new notification types need (existing ones reused).
INSERT INTO portal.notification_templates
  (code, tier, title_template, body_template, action_url_template, action_label, description) VALUES
  ('approval_request', 'action_required',
   'Approval needed — {{resourceRef}}',
   '{{workflowName}} step {{stepNo}}: {{stepName}} awaits your decision.',
   '{{actionUrl}}', 'Review', 'Notification type: approval_request'),
  ('approval_granted', 'informational',
   '{{resourceRef}} approved',
   '{{workflowName}} approved by {{actor}} at step {{stepNo}}.{{commentsLine}}',
   '{{actionUrl}}', 'View', 'Notification type: approval_granted'),
  ('approval_rejected', 'action_required',
   '{{resourceRef}} rejected',
   '{{workflowName}} rejected by {{actor}} at step {{stepNo}}.{{commentsLine}}',
   '{{actionUrl}}', 'View', 'Notification type: approval_rejected'),
  ('assignment', 'action_required',
   'Assigned to you — {{resourceRef}}',
   '{{summary}}',
   '{{actionUrl}}', 'Open', 'Notification type: assignment'),
  ('workflow_completed', 'informational',
   '{{workflowName}} completed — {{resourceRef}}',
   'All approvals are in.',
   '{{actionUrl}}', 'View', 'Notification type: workflow_completed'),
  ('ai_insight', 'informational',
   'AI insight — {{title}}',
   '{{summary}}',
   '{{actionUrl}}', 'View', 'Notification type: ai_insight'),
  ('system_alert', 'urgent',
   'System alert — {{title}}',
   '{{summary}}',
   '{{actionUrl}}', 'View', 'Notification type: system_alert')
ON CONFLICT (code) DO NOTHING;

-- Route seeds — wire existing + new events. Recipient via 'explicit' means
-- the publishing module supplies payload.recipientId; the workflow routes
-- resolve the approver/starter from the instance.
INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('wio.created',          'project',  'assignment',          'wio_created',        'explicit',                '["in_app"]',          'informational'),
  ('wio.converted',        'project',  'workflow_completed',  'wio_converted',      'explicit',                '["in_app"]',          'informational'),
  ('wio.cancelled',        'project',  'workflow_cancelled',  'wio_cancelled',      'explicit',                '["in_app"]',          'informational'),
  ('wio.clock_alert',      'project',  'deadline',            'wio_day12_alert',    'explicit',                '["in_app","email"]',  'action_required'),
  ('wio.clock_overdue',    'project',  'delay',               'wio_overdue',        'explicit',                '["in_app","email"]',  'urgent'),
  ('workflow.step_pending','approval', 'approval_request',    'approval_request',   'workflow_step_approver',  '["in_app","teams"]',  'action_required'),
  ('workflow.approved',    'approval', 'approval_granted',    'approval_granted',   'workflow_started_by',     '["in_app"]',          'informational'),
  ('workflow.rejected',    'approval', 'approval_rejected',   'approval_rejected',  'workflow_started_by',     '["in_app"]',          'action_required'),
  ('ar.overdue',           'project',  'escalation',          'ar_overdue_45',      'explicit',                '["in_app","email"]',  'action_required'),
  ('system.alert',         'system',   'system_alert',        'system_alert',       'explicit',                '["in_app"]',          'urgent')
ON CONFLICT (event_type) DO NOTHING;

-- =====================================================================
-- CONFIG — delivery engine + channel enablement (retry/backoff as data).
-- =====================================================================
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('notifications.channels_live', '["in_app"]', 'notifications',
   'Channels that actually attempt delivery. Add teams/email once their credentials are set.'),
  ('notifications.retry_max_attempts', '5', 'notifications', 'Delivery attempts before dead-letter.'),
  ('notifications.retry_base_seconds', '30', 'notifications', 'Exponential backoff base: base * 2^attempt.'),
  ('notifications.retry_cap_seconds', '3600', 'notifications', 'Backoff cap.'),
  ('teams.webhook_url', '""', 'notifications', 'Incoming-webhook URL for the Teams channel (empty = not configured).'),
  ('email.from_address', '"noreply@essentia.in"', 'notifications', 'From address for the Email channel.')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- GRANTS (db/007 pattern)
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE
  ON portal.events, portal.notification_deliveries,
     portal.notification_preferences, portal.event_routes
  TO essentia_app;
