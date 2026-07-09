-- =====================================================================
-- 013 — WORKFLOW ENGINE v1 · STRUCTURE (Phase 4, Rollout Step 1)
--   Creates ONLY the four new tables (WES v1.0 §3):
--     workflow_groups · workflow_group_approvers · workflow_tasks ·
--     workflow_delegations
--   Additive + forward-only + idempotent (ADR-010). No existing table is
--   modified, no data is re-seeded, no engine code changes here — those are
--   later rollout steps. The legacy workflow_steps/instances/actions tables
--   are untouched, so the current PIO chain keeps working unchanged.
--
--   ROLLBACK: additive only. To reverse, DROP the four tables below (no other
--   object depends on them yet). No shipped migration is edited.
-- =====================================================================

-- ---------------------------------------------------------------------
-- WORKFLOW_GROUPS — ordered groups within a definition. Groups run in
-- sequence; approvers within a group run in parallel (quorum). condition
-- NULL = always run.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.workflow_groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  definition_code VARCHAR(50) NOT NULL REFERENCES portal.workflow_definitions(code) ON DELETE CASCADE,
  group_no        INTEGER NOT NULL,
  name            VARCHAR(200) NOT NULL,
  quorum          INTEGER NOT NULL DEFAULT 1 CHECK (quorum >= 1),
  reject_policy   VARCHAR(10) NOT NULL DEFAULT 'fail_fast'
                  CHECK (reject_policy IN ('fail_fast','continue')),
  condition       JSONB,                                   -- NULL = always run
  sla_hours       INTEGER CHECK (sla_hours IS NULL OR sla_hours > 0),
  warn_hours      INTEGER CHECK (warn_hours IS NULL OR warn_hours > 0),
  timeout_hours   INTEGER CHECK (timeout_hours IS NULL OR timeout_hours > 0),
  timeout_action  VARCHAR(12) CHECK (timeout_action IN ('auto_approve','auto_reject','escalate')),
  reminder_hours  INTEGER CHECK (reminder_hours IS NULL OR reminder_hours > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (definition_code, group_no)
);

-- ---------------------------------------------------------------------
-- WORKFLOW_GROUP_APPROVERS — the approver specification(s) for a group
-- (>= 1; more than one makes the group parallel). Exactly one target is
-- populated consistent with approver_type.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.workflow_group_approvers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id         UUID NOT NULL REFERENCES portal.workflow_groups(id) ON DELETE CASCADE,
  approver_type    VARCHAR(15) NOT NULL CHECK (approver_type IN ('user','access_level','role','dynamic')),
  approver_user_id UUID REFERENCES public.users(id),       -- when approver_type='user'
  approver_level   access_level,                           -- when approver_type='access_level'
  approver_ref     VARCHAR(100),                           -- role code / dynamic resolver key
  approver_hint    VARCHAR(200),
  escalation_type  VARCHAR(15) CHECK (escalation_type IN ('user','access_level','role','dynamic')),
  escalation_ref   VARCHAR(100),                           -- escalation target (id/level/role)
  sort_order       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_wf_group_approvers_group
  ON portal.workflow_group_approvers (group_id);

-- ---------------------------------------------------------------------
-- WORKFLOW_TASKS — the runtime per-approver unit (assignment, SLA,
-- delegation, timeout all attach here). Materialized when a group
-- activates on an instance.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.workflow_tasks (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id          UUID NOT NULL REFERENCES portal.workflow_instances(id) ON DELETE CASCADE,
  group_no             INTEGER NOT NULL,
  assignee_user_id     UUID NOT NULL REFERENCES public.users(id),
  delegated_to_user_id UUID REFERENCES public.users(id),
  status               VARCHAR(12) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','skipped',
                                         'delegated','timed_out','escalated','expired')),
  assigned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_due_at           TIMESTAMPTZ,
  warn_at              TIMESTAMPTZ,
  timeout_at           TIMESTAMPTZ,
  reminded_at          TIMESTAMPTZ,
  acted_by             UUID REFERENCES public.users(id),
  acted_at             TIMESTAMPTZ,
  comments             TEXT,
  UNIQUE (instance_id, group_no, assignee_user_id)         -- one task per approver per group
);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_inbox
  ON portal.workflow_tasks (assignee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_sla
  ON portal.workflow_tasks (sla_due_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wf_tasks_timeout
  ON portal.workflow_tasks (timeout_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- WORKFLOW_DELEGATIONS — standing / out-of-office delegation. definition_code
-- NULL = applies to all workflows. Resolved at task materialization.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.workflow_delegations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delegator_id    UUID NOT NULL REFERENCES public.users(id),
  delegate_id     UUID NOT NULL REFERENCES public.users(id),
  from_date       DATE NOT NULL,
  to_date         DATE NOT NULL,
  definition_code VARCHAR(50) REFERENCES portal.workflow_definitions(code),  -- NULL = all
  created_by      UUID REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  CHECK (to_date >= from_date),
  CHECK (delegate_id <> delegator_id)
);
CREATE INDEX IF NOT EXISTS idx_wf_delegations_active
  ON portal.workflow_delegations (delegator_id, from_date, to_date)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- GRANTS (db/007 pattern — new tables need explicit grants).
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
  ON portal.workflow_groups, portal.workflow_group_approvers,
     portal.workflow_tasks, portal.workflow_delegations
  TO essentia_app;
