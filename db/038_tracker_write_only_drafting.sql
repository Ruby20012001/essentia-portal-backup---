-- =====================================================================
-- 038 — WIO → PIO TRACKER · ONLY THE WIO TEAM WRITES
--
--   Ruby, 2026-09-02: "wo 6 log edit kar sakte hain ... none can touch
--   that file except that they can watch the file only."
--
--   The board already worked that way. The delay log did not. db/030
--   granted create and edit on `wio_tracker_delay` to every L2/L3 in the
--   portal and to all of L0/L1, on the reasoning that the person who knows
--   why a WIO is stuck is routinely not on the owning team — so CRM should
--   be able to say so.
--
--   That reasoning is sound and it is no longer the rule. One team owns the
--   board and everything hanging off it; everybody else reads. A delay row
--   is not a footnote — it changes a WIO's priority score and can move it up
--   the board — so "CRM cannot edit but can log a delay" was a smaller gate
--   than it looked.
--
--   Shape: the global rows go to FALSE, and DRAFTING gets department-scoped
--   TRUE rows. A department row beats a global one, so DRAFTING writes and
--   every other department is denied — including departments that do not
--   exist yet, which would otherwise inherit the global grant on creation.
--   Denying by default and granting by name is the whole point of the model.
--
--   READ is untouched. CRM still sees the entire board and every delay on
--   it, which is what they need in order to answer for their own projects.
--
--   No UI change goes with this. getTrackerBoard resolves `can` from these
--   same rows and the client renders controls from it, so the buttons
--   disappear for everyone but the WIO team on the next page load.
--
--   Idempotent.
-- =====================================================================

-- 1. Nobody writes the delay log by virtue of their access level alone.
UPDATE public.permissions
   SET allowed = FALSE,
       notes = 'Withdrawn (Ruby, 2026-09-02): only DRAFTING writes to the tracker. '
               'Granted by name in the department-scoped rows below.'
 WHERE department_id IS NULL
   AND resource_type = 'wio_tracker_delay'
   AND action_code IN ('create', 'edit');

-- 2. The WIO team writes it. Dipmallya's and Neeraj's teams both sit inside
--    DRAFTING, so one department row covers both.
INSERT INTO public.permissions
  (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT lvl.level::access_level, d.id, 'wio_tracker_delay', act.code, TRUE, 'own_dept',
       'WIO team only (Ruby, 2026-09-02): the team that owns the board owns its delays'
FROM public.departments d
CROSS JOIN (VALUES ('L2'), ('L3')) AS lvl(level)
CROSS JOIN (VALUES ('read'), ('create'), ('edit')) AS act(code)
WHERE d.code = 'DRAFTING'
ON CONFLICT (access_level, department_id, resource_type, action_code)
DO UPDATE SET allowed = TRUE, notes = EXCLUDED.notes;

-- 3. Say it out loud for CRM rather than leaving it to the absence of a row,
--    so anyone reading the table sees the decision instead of inferring it.
INSERT INTO public.permissions
  (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT lvl.level::access_level, d.id, 'wio_tracker_delay', act.code, act.ok, 'own_dept', act.note
FROM public.departments d
CROSS JOIN (VALUES ('L2'), ('L3')) AS lvl(level)
CROSS JOIN (VALUES
  ('read',   TRUE,  'CRM sees every delay on the board — that is the point of the board'),
  ('create', FALSE, 'SECURITY RULE (Ruby, 2026-09-02): view-only. A delay row changes priority; raise it with the WIO team'),
  ('edit',   FALSE, 'SECURITY RULE (Ruby, 2026-09-02): view-only')
) AS act(code, ok, note)
WHERE d.code = 'CRM_EE'
ON CONFLICT (access_level, department_id, resource_type, action_code)
DO UPDATE SET allowed = EXCLUDED.allowed, notes = EXCLUDED.notes;

-- 4. The rule, asserted. If any future migration re-opens a write to anyone
--    outside DRAFTING, this fails loudly here instead of quietly in production.
DO $$
DECLARE offender TEXT;
BEGIN
  SELECT string_agg(
           format('%s/%s %s.%s', p.access_level, COALESCE(d.code, 'ALL'),
                  p.resource_type, p.action_code), ', ')
    INTO offender
    FROM public.permissions p
    LEFT JOIN public.departments d ON d.id = p.department_id
   WHERE p.resource_type IN ('wio_tracker', 'wio_tracker_delay')
     AND p.action_code IN ('create', 'edit', 'delete')
     AND p.allowed
     AND COALESCE(d.code, '') <> 'DRAFTING';

  IF offender IS NOT NULL THEN
    RAISE EXCEPTION 'Only DRAFTING may write to the tracker. Still granted: %', offender;
  END IF;
END $$;
