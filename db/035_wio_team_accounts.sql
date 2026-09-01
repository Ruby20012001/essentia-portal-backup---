-- =====================================================================
-- 035 — WIO TEAM · REAL ACCOUNTS
--
--   Source: Ruby's directory, 2026-09-01 — "all senior draftsman, and dipmalya
--   & neeraj & vishal are team leads of wio departments".
--
--   Six real people. This is NOT db/900: those are dev fixtures sharing one
--   published password and must never load in production. These are staff
--   records, and they load everywhere.
--
--   NO PASSWORDS ARE SET, DELIBERATELY.
--   Every row here is auth_provider = 'entra' with password_hash left NULL.
--   lib/auth/providers/local-password.ts refuses any account whose
--   password_hash is NULL, so these six can sign in ONLY through "Sign in with
--   Microsoft" — and until the ENTRA_* variables are configured, they cannot
--   sign in at all. That is the intended state.
--
--   The alternative — generating passwords here and sending them out — would
--   put six real credentials for a board of live client data into a git
--   repository and a chat thread. There is no invite / set-password / reset
--   flow in the portal yet (see docs/DEPLOYMENT.md), so Entra is the only safe
--   way in today. If these people are not on Microsoft 365, the answer is to
--   build that flow, not to work around this.
--
--   ACCESS these rows produce, via db/030's department-scoped grants:
--     all six are in DRAFTING → read + create + edit + delete on the tracker.
--     L2 (leads) and L3 (senior draftsmen) hold the same grants there on
--     purpose: the person who moves a WIO each morning is a team member, not
--     the HOD. Level still separates them everywhere else in the portal.
--
--   Additive + idempotent. ON CONFLICT (email) DO NOTHING, so re-running never
--   overwrites a record HR or Keka has since corrected.
--   ROLLBACK: DELETE FROM public.users WHERE email IN (…the six below…);
-- =====================================================================

INSERT INTO public.users
  (email, full_name, display_name, access_level, department_id, job_title, auth_provider)
SELECT v.email, v.full_name, v.display_name, v.access_level::access_level,
       d.id, v.job_title, 'entra'
FROM (VALUES
  -- Team leads of the WIO departments (Ruby, 2026-09-01). L2.
  ('dipmallya.wio@essentia.in', 'Dipmalya Das',   'Dipmalya', 'L2',
   'Team Lead — WIO department'),
  ('neeraj.wio@essentia.in',    'Neeraj Jangra',  'Neeraj',   'L2',
   'Team Lead — WIO department'),
  ('wio.vishal@essentia.in',    'Vishal Kaushik', 'Vishal',   'L2',
   'Team Lead — WIO department'),

  -- Senior draughtsmen. L3, and L3 holds full edit on the tracker by design.
  ('wio.anshul@essentia.in',      'Anshul Soni', 'Anshul', 'L3', 'Senior Draughtsman'),
  ('wio.atul@essentia.in',        'Atul Yadav',  'Atul',   'L3', 'Senior Draughtsman'),
  ('Jyoti.drafting@essentia.in',  'Jyoti Yadav', 'Jyoti',  'L3', 'Senior Draughtsman')
) AS v(email, full_name, display_name, access_level, job_title)
CROSS JOIN LATERAL (
  SELECT id FROM public.departments WHERE code = 'DRAFTING'
) AS d
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------
-- Proof. Six accounts, all in DRAFTING, none able to sign in with a password.
--
-- The password check is the one that matters: if a future edit ever gives one
-- of these rows a hash, it becomes an account with a credential nobody
-- deliberately issued. Fail the load rather than let that pass quietly.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_total  INTEGER;
  n_leads  INTEGER;
  n_pw     INTEGER;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE u.access_level = 'L2'),
         COUNT(*) FILTER (WHERE u.password_hash IS NOT NULL)
    INTO n_total, n_leads, n_pw
    FROM public.users u
    JOIN public.departments d ON d.id = u.department_id
   WHERE d.code = 'DRAFTING'
     AND u.email IN ('dipmallya.wio@essentia.in','neeraj.wio@essentia.in',
                     'wio.vishal@essentia.in','wio.anshul@essentia.in',
                     'wio.atul@essentia.in','Jyoti.drafting@essentia.in');

  IF n_total <> 6 THEN
    RAISE EXCEPTION 'Expected 6 WIO team accounts in DRAFTING, found %. '
      'Check that db/002 seeded the DRAFTING department.', n_total;
  END IF;
  IF n_leads <> 3 THEN
    RAISE EXCEPTION 'Expected 3 team leads at L2, found %.', n_leads;
  END IF;
  IF n_pw <> 0 THEN
    RAISE EXCEPTION
      'A WIO team account carries a password hash (% of 6). These are Entra-only '
      'accounts — a password here is a credential nobody issued.', n_pw;
  END IF;
END $$;
