-- =====================================================================
-- 040 — A TEAM LEAD CAN RESET THEIR OWN TEAM'S PASSWORD
--
--   Ruby, 2026-09-03. "Forgot password" needs a way to reach the person
--   outside the portal — an email, a text — and the portal has neither. Until
--   it does, someone who forgets their password cannot get back in without
--   Ruby running a script and pasting SQL, which makes one person the password
--   desk for the whole team.
--
--   A lead resetting it does the same job with a person standing in for the
--   email: they know who is asking, which is exactly the check a reset link is
--   trying to make. In a team of six that is a stronger check, not a weaker one.
--
--   ITS OWN RESOURCE, NOT `users`.`edit`. Reusing the users grant would hand
--   whoever holds it everything else editing a user record implies — level,
--   department, active status. This is one verb: set a password. Deny-by-
--   default means nobody else has it until named here.
--
--   WHO. L2 in DRAFTING — the three WIO leads — scoped own_dept, because the
--   service reads that scope and refuses a target outside the actor's own
--   department. L0/L1 hold it at 'all' as the backstop for the day a lead is
--   the one who is locked out.
--
--   The shared view-only login is denied by name. db/039 wrote FALSE rows for
--   every resource type that existed then; this one did not exist yet, and a
--   password reset is the last thing a password half the company knows should
--   be able to do.
--
--   Additive + idempotent.
--   ROLLBACK: DELETE FROM public.permissions WHERE resource_type='user_password';
--             DELETE FROM public.resource_types WHERE code='user_password';
-- =====================================================================

INSERT INTO public.resource_types (code, name, domain, is_financial, is_hr) VALUES
  ('user_password', 'Portal password (reset for someone else)', 'shared', FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Leadership: the backstop, across departments.
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
VALUES
  ('L0', 'user_password', 'edit', TRUE, 'all',
   'Founders: the backstop for the day a team lead is the one locked out'),
  ('L1', 'user_password', 'edit', TRUE, 'all', NULL)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- The WIO leads, for their own department only.
INSERT INTO public.permissions
  (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT 'L2', d.id, 'user_password', 'edit', TRUE, 'own_dept',
       'Team leads reset their own team (Ruby, 2026-09-03) — the portal cannot '
       'send a reset email, and a lead knows who is asking'
FROM public.departments d
WHERE d.code = 'DRAFTING'
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Not the shared login. Ever.
INSERT INTO public.permissions
  (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT lvl.level::access_level, d.id, 'user_password', a.code, FALSE, 'own_records',
       'SECURITY RULE: the shared view-only login never touches a credential'
FROM public.departments d
CROSS JOIN (VALUES ('L2'), ('L3')) AS lvl(level)
CROSS JOIN public.permission_actions a
WHERE d.code = 'TRACKER_VIEW'
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Proof. Exactly who is meant to hold this, and nobody else.
-- ---------------------------------------------------------------------
DO $$
DECLARE holders TEXT;
BEGIN
  SELECT string_agg(format('%s/%s', p.access_level, COALESCE(d.code, 'ALL')), ', ' ORDER BY 1)
    INTO holders
    FROM public.permissions p
    LEFT JOIN public.departments d ON d.id = p.department_id
   WHERE p.resource_type = 'user_password' AND p.allowed;

  IF holders IS DISTINCT FROM 'L0/ALL, L1/ALL, L2/DRAFTING' THEN
    RAISE EXCEPTION
      'Password reset is held by: %. Expected only the founders, senior '
      'leadership and the WIO leads.', holders;
  END IF;
END $$;
