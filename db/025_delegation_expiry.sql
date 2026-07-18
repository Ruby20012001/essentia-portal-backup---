-- =====================================================================
-- 025 — DELEGATION AUTO-EXPIRY VIA THE SCHEDULER (Phase 4, Step 6 · WES §9/§10)
--   Step 6 requires standing delegations to expire automatically with no manual
--   cleanup, REUSING the scheduler framework rather than a new timing mechanism.
--
--   IMPORTANT — this does NOT move enforcement. A delegation stops resolving the
--   moment CURRENT_DATE passes to_date, because resolveDelegateChain filters on
--   the window; that remains the source of truth and cannot drift if a job is
--   late, disabled or fails. This migration adds the BOOKKEEPING half: a daily
--   sweep stamps expired_at and notifies both parties through the Event Bus, so
--   an ended delegation is explicit in the UI and audit rather than merely
--   implied by a date comparison. Defence in depth, not a second mechanism.
--
--   Additive and idempotent; no existing migration modified.
--   ROLLBACK: ALTER TABLE ... DROP COLUMN expired_at;
--             DROP INDEX portal.idx_wd_pending_expiry;
--             DELETE FROM portal.scheduled_jobs WHERE name='delegation-expiry';
--             DELETE FROM portal.event_routes WHERE event_type='workflow.delegation_expired';
-- =====================================================================

ALTER TABLE portal.workflow_delegations
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- The sweep's working set: still-open delegations that may have lapsed.
CREATE INDEX IF NOT EXISTS idx_wd_pending_expiry
  ON portal.workflow_delegations (to_date)
  WHERE revoked_at IS NULL AND expired_at IS NULL;

-- Expiry notification → in-app, explicit recipient (payload.recipientId).
INSERT INTO portal.event_routes
  (event_type, category, notification_type, template_code, recipient_strategy, default_channels, priority) VALUES
  ('workflow.delegation_expired', 'approval', 'assignment', 'assignment', 'explicit', '["in_app"]', 'informational')
ON CONFLICT (event_type) DO NOTHING;

-- Daily sweep, just after midnight: any delegation whose window closed
-- yesterday is stamped and both parties told. Handler 'delegation-expiry'
-- lives in the scheduler HANDLERS registry.
INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('delegation-expiry',
   'Stamp standing workflow delegations whose window has closed and notify both parties (WES §9). Enforcement is the date window itself; this is the bookkeeping sweep.',
   'daily', '00:05', TRUE, 3, 300)
ON CONFLICT (name) DO NOTHING;
