-- =====================================================================
-- 022 — WEEKLY PULSE AUTO-DRAFT (Brief §26/§36 · Velocity Gate #2)
--   "Every Friday, every active project, the portal drafts the 3-line update
--   and the CRM TL reviews and sends." The draft is a portal.communication_spine
--   row (letter_type='weekly_pulse', trigger_event='friday_auto_draft', ai_draft
--   set, sent_at NULL) — the TL then reviews (scroll gate) and sends.
--
--   The scheduler supports interval/daily only, so this is a DAILY job and the
--   handler ('weekly-pulse-draft') no-ops unless today is Friday. Cadence mirrors
--   config pulse.auto_draft = {"day":"friday","hour":5}. Idempotency (one pulse
--   per project per ISO week) is enforced in the handler's NOT EXISTS guard.
--   Forward-only, idempotent. No new table — communication_spine already exists.
--
--   ROLLBACK: DELETE FROM portal.scheduled_jobs WHERE name='weekly-pulse-draft';
-- =====================================================================

INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('weekly-pulse-draft',
   'Draft the Friday Weekly Pulse for every active project without one this week (Brief §26/§36) — Velocity Gate #2.',
   'daily', '05:00', TRUE, 3, 300)
ON CONFLICT (name) DO NOTHING;
