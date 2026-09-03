-- =====================================================================
-- 039 — ONE SHARED, READ-ONLY WAY INTO THE TRACKER
--
--   Ruby, 2026-09-03: "ek public mail banadete hai jo sirf essentia ke logo
--   ko hi pata hoga, wo open karenge dekh lenge lekin edit nahi kar payenge."
--
--   One account the WIO team can hand round essentia. It opens the board and
--   can change nothing, anywhere.
--
--   WHY IT GETS ITS OWN DEPARTMENT.
--   Dropping it into CRM_EE would also hand it everything else a CRM team
--   member holds — raising WIOs, recording EH sales, uploading VisionCAM
--   photos. Right for a named colleague, wrong for a password half the company
--   knows. Denying those on CRM_EE instead would strip real CRM staff of
--   abilities they are supposed to have.
--
--   WHY A NEW DEPARTMENT IS NOT ENOUGH ON ITS OWN.
--   The first draft of this file stopped there, on the assumption that an
--   unknown department inherits nothing. It does not. db/004 seeds GLOBAL rows
--   per access level (department_id IS NULL), and those apply to every L3 in
--   the portal regardless of department — so this account came out able to
--   read projects and to CREATE eh_sales rows. Deny-by-default covers a
--   resource nobody has granted; it does not cover a level-wide grant that
--   already exists.
--
--   So the shutting is done by name. A department row beats a global one
--   (permissions.ts orders department_id NULLS LAST), and the CROSS JOIN below
--   writes an explicit FALSE for every resource × action in the vocabulary,
--   then re-opens exactly two. That also holds for grants that do not exist
--   yet: a global L3 row added by some future migration is already denied here.
--
--   HONEST LIMITS OF A SHARED LOGIN, recorded because they are real:
--     · The audit trail cannot say who looked — every visit is this one row.
--     · One password known to many leaves the building eventually. Rotate it
--       with db/set-team-passwords.mjs whenever someone leaves; it costs
--       everyone a new password at once.
--     · It is a stopgap. When Microsoft sign-in is configured, retire this
--       account (is_active = FALSE) and let people in as themselves.
--
--   NO PASSWORD IS SET HERE — the account is unusable until someone runs
--   db/set-team-passwords.mjs. A credential does not belong in a migration.
--
--   Additive + idempotent.
--   ROLLBACK: DELETE FROM public.users WHERE email = 'wio.view@essentia.in';
--             DELETE FROM public.permissions WHERE department_id =
--               (SELECT id FROM public.departments WHERE code='TRACKER_VIEW');
--             DELETE FROM public.departments WHERE code = 'TRACKER_VIEW';
-- =====================================================================

INSERT INTO public.departments (code, name, vertical) VALUES
  ('TRACKER_VIEW', 'WIO → PIO Tracker — view only', 'SHARED')
ON CONFLICT (code) DO NOTHING;

-- 1. Shut everything, by name, so no level-wide grant reaches this account.
INSERT INTO public.permissions
  (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT 'L3', d.id, r.code, a.code, FALSE, 'own_records',
       'Shared view-only login (Ruby, 2026-09-03): denied by name, because global '
       'L3 rows from db/004 would otherwise apply to this department too'
FROM public.departments d
CROSS JOIN public.resource_types r
CROSS JOIN public.permission_actions a
WHERE d.code = 'TRACKER_VIEW'
ON CONFLICT (access_level, department_id, resource_type, action_code)
DO UPDATE SET allowed = FALSE, notes = EXCLUDED.notes;

-- 2. Re-open the two things it exists to do.
UPDATE public.permissions p
   SET allowed = TRUE,
       scope = 'own_dept',
       notes = 'Shared essentia view-only login (Ruby, 2026-09-03): read the board '
               'and read why a row is stuck. Nothing else.'
  FROM public.departments d
 WHERE d.id = p.department_id
   AND d.code = 'TRACKER_VIEW'
   AND p.resource_type IN ('wio_tracker', 'wio_tracker_delay')
   AND p.action_code = 'read';

-- 3. The account itself. auth_provider 'local' by design — this one signs in
--    with a password; the six real people move to Microsoft when it lands.
INSERT INTO public.users
  (email, full_name, display_name, access_level, department_id, job_title, auth_provider)
SELECT 'wio.view@essentia.in', 'essentia — view only', 'View only', 'L3',
       d.id, 'Shared read-only access to the WIO → PIO Tracker', 'local'
FROM public.departments d
WHERE d.code = 'TRACKER_VIEW'
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------
-- Proof, run the way the APPLICATION asks — for every resource and action,
-- resolve the row permissions.ts would pick (department first, global second)
-- and assert that exactly two come back allowed. Checking only the rows this
-- file writes would have missed the bug that made it necessary.
-- ---------------------------------------------------------------------
DO $$
DECLARE granted TEXT;
BEGIN
  SELECT string_agg(format('%s.%s', x.resource_type, x.action_code), ', ' ORDER BY x.resource_type)
    INTO granted
    FROM public.resource_types r
    CROSS JOIN public.permission_actions a
    CROSS JOIN LATERAL (
      SELECT p.allowed, p.resource_type, p.action_code
        FROM public.permissions p
       WHERE p.access_level = 'L3'
         AND p.resource_type = r.code
         AND p.action_code = a.code
         AND (p.department_id = (SELECT id FROM public.departments WHERE code = 'TRACKER_VIEW')
              OR p.department_id IS NULL)
       ORDER BY p.department_id NULLS LAST
       LIMIT 1
    ) AS x
   WHERE x.allowed
     AND NOT (x.resource_type IN ('wio_tracker', 'wio_tracker_delay') AND x.action_code = 'read');

  IF granted IS NOT NULL THEN
    RAISE EXCEPTION
      'The shared view-only login resolves to more than reading the tracker: %. '
      'It is handed around the company — it must never be able to change anything.',
      granted;
  END IF;
END $$;
