-- =====================================================================
-- DEV FIXTURES — NEVER RUN IN PRODUCTION
-- Deterministic sample rows so the S2 dashboard and WIO clock can be
-- exercised locally. Idempotent (fixed UUIDs + ON CONFLICT / NOT EXISTS).
-- Dates are CURRENT_DATE-relative so RAG states hold on any day.
-- =====================================================================

-- Dev department (code will also arrive via 002 seeds; conflict-safe)
INSERT INTO public.departments (id, code, name, vertical)
VALUES ('00000000-0000-4000-8000-00000000d001', 'CRM_EE', 'CRM — essentia environments', 'EE')
ON CONFLICT (code) DO NOTHING;

-- Dev CRM Team Lead (L2) — DEV_USER_ID in frontend/.env.example points here
INSERT INTO public.users (id, email, full_name, display_name, access_level, department_id, job_title)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'dev.crmtl@essentia.in',
  'Dev CRM Team Lead',
  'Dev TL',
  'L2',
  (SELECT id FROM public.departments WHERE code = 'CRM_EE'),
  'CRM Team Lead (dev fixture)'
)
ON CONFLICT (email) DO NOTHING;

-- RBAC test users — one per access level (verification matrix)
INSERT INTO public.users (id, email, full_name, display_name, access_level, department_id, job_title)
VALUES
  ('00000000-0000-4000-8000-000000000002', 'dev.founder@essentia.in',
   'Dev Founder', 'Dev L0', 'L0', NULL, 'Founder (dev fixture)'),
  ('00000000-0000-4000-8000-000000000003', 'dev.coo@essentia.in',
   'Dev COO', 'Dev L1', 'L1', NULL, 'COO (dev fixture)'),
  ('00000000-0000-4000-8000-000000000004', 'dev.site@essentia.in',
   'Dev Site Member', 'Dev L3', 'L3',
   (SELECT id FROM public.departments WHERE code = 'SITE'),
   'Site team (dev fixture)')
ON CONFLICT (email) DO NOTHING;

-- Exit-protocol fixture (Velocity Gate #4): a staffer whose Keka exit date is
-- today, so the 11:59pm sweep has a real exit to fire on in dev.
INSERT INTO public.users
  (id, email, full_name, display_name, access_level, department_id, job_title, exit_date)
VALUES
  ('00000000-0000-4000-8000-000000000005', 'dev.exiting@essentia.in',
   'Dev Exiting Staff', 'Dev Exit', 'L3',
   (SELECT id FROM public.departments WHERE code = 'SITE'),
   'Site supervisor (dev fixture — exit date today)', CURRENT_DATE)
ON CONFLICT (email) DO NOTHING;

-- Dev password: all fixture users share 'essentia-dev-2026' (scrypt, one
-- salt — fine for an in-memory dev seed, never production). Enables the
-- local password login path; real accounts arrive via Entra.
UPDATE public.users
SET password_hash = 'a2f7c19640a4db2124f52271b1b379f8:4280680cec56f9f76cd3f1e0f372a3f6345619ccc5a1a5ad750cbcab490e1cb6597f42fc860dc04961d37b15aa84af49fb7dc2780120bc5c34669e143927dd8a',
    auth_provider = 'local'
WHERE email LIKE 'dev.%@essentia.in';

-- Two families
INSERT INTO public.families (id, family_code, primary_contact, city, communication_pref, profile_complete_pct)
VALUES
  ('00000000-0000-4000-8000-00000000f001', 'DEV-FAM-001', 'Mehra Family', 'Gurugram', 'whatsapp', 80),
  ('00000000-0000-4000-8000-00000000f002', 'DEV-FAM-002', 'Kapoor Family', 'New Delhi', 'whatsapp', 45)
ON CONFLICT (family_code) DO NOTHING;

-- Three projects: green / amber / red, all assigned to the dev TL so the
-- L2 RLS path returns them.
INSERT INTO ee.projects (id, project_code, family_id, project_name, site_address, city,
                         crmtl_id, current_phase, rag_status, ar_outstanding,
                         first_instalment_date, target_dor_date)
VALUES
  ('00000000-0000-4000-8000-00000000a001', 'ED/26-27/901',
   '00000000-0000-4000-8000-00000000f001', 'Mehra Residence',
   'Golf Course Road, Gurugram', 'Gurugram',
   '00000000-0000-4000-8000-000000000001', 'design_development', 'green',
   0, CURRENT_DATE - 60, CURRENT_DATE + 270),
  ('00000000-0000-4000-8000-00000000a002', 'ED/26-27/902',
   '00000000-0000-4000-8000-00000000f001', 'Mehra Farmhouse',
   'Westend Greens, New Delhi', 'New Delhi',
   '00000000-0000-4000-8000-000000000001', 'production', 'amber',
   850000, CURRENT_DATE - 150, CURRENT_DATE + 120),
  ('00000000-0000-4000-8000-00000000a003', 'ED/26-27/903',
   '00000000-0000-4000-8000-00000000f002', 'Kapoor Penthouse',
   'Lower Parel, Mumbai', 'Mumbai',
   '00000000-0000-4000-8000-000000000001', 'installation', 'red',
   1840000, CURRENT_DATE - 300, CURRENT_DATE + 30)
ON CONFLICT (project_code) DO NOTHING;

-- Four WIOs across the clock states: green, amber, red, overdue
INSERT INTO ee.wio (wio_number, project_id, department_code, target_pio_date,
                    boq_approved, design_3d_approved, sld_approved, initiated_by)
SELECT v.wio_number, v.project_id::UUID, v.department_code, v.target_pio_date,
       v.boq, v.d3d, v.sld, '00000000-0000-4000-8000-000000000001'
FROM (VALUES
  ('WIO/26-27/901/ARCH', '00000000-0000-4000-8000-00000000a001', 'ARCH', CURRENT_DATE + 12, TRUE,  FALSE, FALSE),
  ('WIO/26-27/902/3D',   '00000000-0000-4000-8000-00000000a002', '3D',   CURRENT_DATE + 4,  TRUE,  TRUE,  FALSE),
  ('WIO/26-27/903/FFE',  '00000000-0000-4000-8000-00000000a003', 'FFE',  CURRENT_DATE + 1,  TRUE,  TRUE,  TRUE),
  ('WIO/26-27/904/SITE', '00000000-0000-4000-8000-00000000a003', 'SITE', CURRENT_DATE - 2,  FALSE, FALSE, FALSE)
) AS v(wio_number, project_id, department_code, target_pio_date, boq, d3d, sld)
ON CONFLICT (wio_number) DO NOTHING;

-- One overdue invoice on the red project
INSERT INTO ee.billing_milestones (project_id, milestone_name, sequence_no, amount,
                                   trigger_type, is_due, due_date, invoice_raised,
                                   invoice_date, invoice_number)
SELECT '00000000-0000-4000-8000-00000000a003', 'Installation mobilisation', 4, 950000,
       'manual', TRUE, CURRENT_DATE - 12, TRUE, CURRENT_DATE - 20, 'DEV-INV-0031'
WHERE NOT EXISTS (
  SELECT 1 FROM ee.billing_milestones WHERE invoice_number = 'DEV-INV-0031'
);

-- Weekly Pulse sent for the green project this week (1 of 3 → signal fires)
INSERT INTO portal.communication_spine (project_id, family_id, letter_type,
                                        trigger_event, final_content, channel, sent_at)
SELECT '00000000-0000-4000-8000-00000000a001',
       '00000000-0000-4000-8000-00000000f001',
       'weekly_pulse', 'friday_auto_draft',
       'Dev fixture pulse content', 'whatsapp', date_trunc('week', CURRENT_DATE) + INTERVAL '4 days 18 hours'
WHERE NOT EXISTS (
  SELECT 1 FROM portal.communication_spine
  WHERE letter_type = 'weekly_pulse'
    AND project_id = '00000000-0000-4000-8000-00000000a001'
    AND sent_at >= date_trunc('week', CURRENT_DATE)
);

-- ---------------------------------------------------------------------
-- Parallel-approval demo workflow (Phase 4 Step 4) — DEV ONLY. Group 1 is a
-- 2-of-3 cross-functional quorum; group 2 is a single director sign-off. Uses
-- the dev fixture users so it resolves without a Keka sync.
-- ---------------------------------------------------------------------
INSERT INTO portal.workflow_definitions (code, name, resource_type) VALUES
  ('parallel_demo', 'Parallel demo — cross-functional (2 of 3) then director', 'projects')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.workflow_groups (definition_code, group_no, name, quorum, reject_policy) VALUES
  ('parallel_demo', 1, 'Cross-functional review (2 of 3)', 2, 'fail_fast'),
  ('parallel_demo', 2, 'Director sign-off', 1, 'fail_fast')
ON CONFLICT (definition_code, group_no) DO NOTHING;

INSERT INTO portal.workflow_group_approvers
  (group_id, approver_type, approver_user_id, approver_hint, sort_order)
SELECT g.id, 'user', v.uid::uuid, v.hint, v.so
FROM (VALUES
  (1, '00000000-0000-4000-8000-000000000003', 'Dev COO — Finance', 1),
  (1, '00000000-0000-4000-8000-000000000001', 'Dev CRM TL — Legal', 2),
  (1, '00000000-0000-4000-8000-000000000004', 'Dev Site — HR', 3),
  (2, '00000000-0000-4000-8000-000000000002', 'Dev Founder — Director', 1)
) AS v(gno, uid, hint, so)
JOIN portal.workflow_groups g ON g.definition_code = 'parallel_demo' AND g.group_no = v.gno
WHERE NOT EXISTS (
  SELECT 1 FROM portal.workflow_group_approvers ga
  WHERE ga.group_id = g.id AND ga.approver_user_id = v.uid::uuid
);

-- ---------------------------------------------------------------------
-- Conditional-routing demo (Phase 4 Step 5) — DEV ONLY. The middle group
-- (Founder) runs only when context.amount > 50,000,000 (Rs 5 Cr); otherwise it
-- is SKIPPED and the workflow advances straight to the final group.
-- ---------------------------------------------------------------------
INSERT INTO portal.workflow_definitions (code, name, resource_type) VALUES
  ('conditional_demo', 'Conditional demo — founder gate over Rs 5 Cr', 'projects')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.workflow_groups (definition_code, group_no, name, quorum, condition) VALUES
  ('conditional_demo', 1, 'Manager sign-off', 1, NULL),
  ('conditional_demo', 2, 'Founder approval (> Rs 5 Cr)', 1,
   '{"field":"amount","op":">","value":50000000}'::jsonb),
  ('conditional_demo', 3, 'Final record', 1, NULL)
ON CONFLICT (definition_code, group_no) DO NOTHING;

INSERT INTO portal.workflow_group_approvers (group_id, approver_type, approver_user_id, approver_hint, sort_order)
SELECT g.id, 'user', v.uid::uuid, v.hint, 1
FROM (VALUES
  (1, '00000000-0000-4000-8000-000000000003', 'Dev COO — Manager'),
  (2, '00000000-0000-4000-8000-000000000002', 'Dev Founder'),
  (3, '00000000-0000-4000-8000-000000000001', 'Dev CRM TL — Records')
) AS v(gno, uid, hint)
JOIN portal.workflow_groups g ON g.definition_code = 'conditional_demo' AND g.group_no = v.gno
WHERE NOT EXISTS (
  SELECT 1 FROM portal.workflow_group_approvers ga WHERE ga.group_id = g.id
);

-- ---------------------------------------------------------------------
-- SLA demo (Phase 4 Step 7) — DEV ONLY. Group 1 carries an SLA (24h warn 12h),
-- a 48h auto-approve timeout, a 24h reminder cadence, and escalation to the
-- Founder. Use /api/dev/age-workflow-timers to backdate a live instance's
-- deadlines and watch the sweep fire.
-- ---------------------------------------------------------------------
INSERT INTO portal.workflow_definitions (code, name, resource_type) VALUES
  ('sla_demo', 'SLA demo — 24h SLA, 48h auto-approve timeout', 'projects')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.workflow_groups
  (definition_code, group_no, name, quorum, sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours) VALUES
  ('sla_demo', 1, 'Manager review (SLA-gated)', 1, 24, 12, 48, 'auto_approve', 24),
  ('sla_demo', 2, 'Final sign-off', 1, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (definition_code, group_no) DO NOTHING;

INSERT INTO portal.workflow_group_approvers
  (group_id, approver_type, approver_user_id, approver_hint, escalation_type, escalation_ref, sort_order)
SELECT g.id, 'user', v.uid::uuid, v.hint, v.etype, v.eref, 1
FROM (VALUES
  (1, '00000000-0000-4000-8000-000000000003', 'Dev COO — Manager', 'user', 'dev.founder@essentia.in'),
  (2, '00000000-0000-4000-8000-000000000002', 'Dev Founder', NULL, NULL)
) AS v(gno, uid, hint, etype, eref)
JOIN portal.workflow_groups g ON g.definition_code = 'sla_demo' AND g.group_no = v.gno
WHERE NOT EXISTS (
  SELECT 1 FROM portal.workflow_group_approvers ga WHERE ga.group_id = g.id
);
