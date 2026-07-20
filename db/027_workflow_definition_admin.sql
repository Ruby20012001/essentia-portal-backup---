-- =====================================================================
-- 027 — WORKFLOW DEFINITION ADMIN (frontend screens 5 & 6)
--   The definition tables (004/013) were seed-only: nothing in the app ever
--   listed or edited them. Admin screens need a "last updated" and a durable
--   description, so this adds the two columns the UI reads. Existing rows get
--   updated_at = created_at so the column is never null in the list.
--
--   Editing SEMANTICS (enforced in the service, not here):
--     • is_active = FALSE is ARCHIVE, not delete — startWorkflow already
--       requires is_active, so archiving stops NEW instances while every
--       running instance continues untouched.
--     • definitions are never hard-deleted; workflow_groups cascade from the
--       definition, so a delete would sever the history of running work.
--
--   Additive and idempotent; no existing migration modified.
--   ROLLBACK: ALTER TABLE portal.workflow_definitions
--               DROP COLUMN updated_at, DROP COLUMN description;
-- =====================================================================

ALTER TABLE portal.workflow_definitions
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE portal.workflow_definitions
SET updated_at = created_at
WHERE updated_at IS NULL;
