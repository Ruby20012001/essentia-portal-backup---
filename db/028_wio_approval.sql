-- =====================================================================
-- 028 — WIO / GFC APPROVAL WORKFLOW (Brief §29-30 · CRITICAL Day 1)
--   The drawing / GFC approval chain runs on the Phase-4 workflow engine,
--   exactly like pio_approval — nothing bespoke. This seeds the definition and
--   its three internal sign-off groups:
--        Vishakha (WIO/GFC Head) → Yoginder (Design) → Khushpreet (Production Head)
--   The final CLIENT sign-off is the external Client-Portal (OTP) gate and is NOT
--   an internal engine approver, so it is not a group here.
--
--   Approvers carry human hints and are mapped to real users by Keka in
--   production (approver_user_id filled by the same identity sync that maps
--   pio_approval). The dev fixtures (900) map them to fixture users so the chain
--   runs without a Keka sync.
--
--   Additive + idempotent. No engine, scheduler or notification code changes —
--   requestWioApproval simply calls startWorkflow('wio_approval', 'wio', id).
--   ROLLBACK: DELETE FROM portal.workflow_definitions WHERE code='wio_approval';
--             (workflow_groups + approvers cascade.)
-- =====================================================================

INSERT INTO portal.workflow_definitions (code, name, resource_type) VALUES
  ('wio_approval', 'WIO / GFC Approval — drawing sign-off chain', 'wio')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.workflow_groups (definition_code, group_no, name, quorum) VALUES
  ('wio_approval', 1, 'WIO / GFC Head sign-off', 1),
  ('wio_approval', 2, 'Design sign-off', 1),
  ('wio_approval', 3, 'Production Head sign-off', 1)
ON CONFLICT (definition_code, group_no) DO NOTHING;

INSERT INTO portal.workflow_group_approvers (group_id, approver_type, approver_hint, sort_order)
SELECT g.id, 'user', v.hint, 1
FROM (VALUES
  (1, 'Vishakha — WIO / GFC Head'),
  (2, 'Yoginder — Design'),
  (3, 'Khushpreet Arora — Production Head')
) AS v(gno, hint)
JOIN portal.workflow_groups g ON g.definition_code = 'wio_approval' AND g.group_no = v.gno
WHERE NOT EXISTS (
  SELECT 1 FROM portal.workflow_group_approvers ga WHERE ga.group_id = g.id
);
