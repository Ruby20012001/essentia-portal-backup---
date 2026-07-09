-- =====================================================================
-- 014 — SEED THE PIO CHAIN INTO THE GROUP/TASK MODEL (Phase 4, Step 2)
--   Mirrors the existing portal.workflow_steps 1:1 for pio_approval:
--   3 groups × 1 'user' approver, quorum 1, sequential, fail_fast — so the
--   chain behaves identically on the generalized engine (WES §17, ADR-WE-010).
--   Approver identity / email / hint are copied straight from workflow_steps;
--   the engine resolves email → user at task materialization, exactly as the
--   step model did. workflow_steps is left intact for the transition (it still
--   backs the notification recipient strategy). Idempotent; forward-only.
--
--   ROLLBACK: DELETE FROM portal.workflow_group_approvers/groups WHERE
--   definition_code='pio_approval'. No shipped migration edited.
-- =====================================================================

-- Groups (group_no = step_no; name copied).
INSERT INTO portal.workflow_groups (definition_code, group_no, name, quorum, reject_policy)
SELECT s.workflow_code, s.step_no, s.name, 1, 'fail_fast'
FROM portal.workflow_steps s
WHERE s.workflow_code = 'pio_approval'
ON CONFLICT (definition_code, group_no) DO NOTHING;

-- One approver per group, carrying the same identity/email/level/hint.
INSERT INTO portal.workflow_group_approvers
  (group_id, approver_type, approver_user_id, approver_level, approver_ref, approver_hint, sort_order)
SELECT g.id, s.approver_type, s.approver_user_id, s.approver_level, s.approver_email, s.approver_hint, 1
FROM portal.workflow_steps s
JOIN portal.workflow_groups g
  ON g.definition_code = s.workflow_code AND g.group_no = s.step_no
WHERE s.workflow_code = 'pio_approval'
  AND NOT EXISTS (
    SELECT 1 FROM portal.workflow_group_approvers ga WHERE ga.group_id = g.id
  );
