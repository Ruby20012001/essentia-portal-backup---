-- =====================================================================
-- 030 — WIO → PIO TRACKER (S4b · Brief §29-30)
--
--   Dipmallya's team ran this as an Excel workbook. It is NOT a second copy
--   of the S4 WIO/PIO Hub (db/005, ee.wio / ee.pio) — it is a different cut
--   of the same §30 process, and the two must not be conflated:
--
--     ee.wio (S4)          one WIO per department, WIO/YY-YY/NNN, gated by a
--                          three-item checklist (BOQ + 3D + SLD) before it
--                          converts to a PIO. The Velocity Gate 3 clock.
--     ee.tracker_wios      one row per ED/YY-YY/NNN work item, walked along an
--     (this file)          ORDERED chain of stages by hand. The question it
--                          answers is "who is holding this, and for how long",
--                          which the checklist model cannot express.
--
--   The whole tool runs on two hand-maintained fields — `stage_id` and
--   `since`. Everything a user reads (days left, late-here, overdue, who is
--   accountable, what is next) is DERIVED at read time and stored NOWHERE.
--   That is deliberate: a stored status is a status that goes stale silently.
--   The derivation lives in one place, frontend/lib/services/wio-tracker-logic.ts,
--   and is unit-tested there.
--
--   CONFIGURATION-DRIVEN (ADR-EP-01, Monica's standing direction). The stage
--   chain, the 15-day window, the at-risk threshold and the delay reasons are
--   ROWS, not constants. The team retunes the workflow with an UPDATE; nobody
--   ships code to rename a stage or move a `done_by` day.
--
--   Additive + idempotent. No changes to ee.wio, ee.pio, the workflow engine,
--   the scheduler or the notification framework.
--   ROLLBACK: DROP TABLE ee.tracker_delays, ee.tracker_wios, ee.tracker_stages,
--             ee.tracker_delay_reasons, ee.tracker_people, ee.tracker_settings;
--             DELETE FROM public.permissions WHERE resource_type = 'wio_tracker';
--             DELETE FROM public.resource_types WHERE code = 'wio_tracker';
-- =====================================================================

-- ---------------------------------------------------------------------
-- ee.tracker_settings — the board's shared configuration. Exactly one row.
--
--   `today_stamp` reproduces the original workbook's manually stamped date.
--   It is NOT CURRENT_DATE and must not become CURRENT_DATE: the team stamps
--   the day themselves so that every person, and every screenshot taken at
--   any hour, reads the same numbers. A live clock would make two people
--   disagree about whether a WIO is overdue at 11pm. One shared row, not a
--   per-browser value — the whole point of moving off the spreadsheet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ee.tracker_settings (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  team_name    VARCHAR(120) NOT NULL,
  window_days  INTEGER NOT NULL DEFAULT 15 CHECK (window_days > 0),
  at_risk_from INTEGER NOT NULL DEFAULT 5  CHECK (at_risk_from >= 0),
  today_stamp  DATE NOT NULL DEFAULT CURRENT_DATE,
  stamped_by   UUID REFERENCES public.users(id),
  stamped_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN ee.tracker_settings.today_stamp IS
  'The date the board is read against. Stamped by the team, never derived from '
  'CURRENT_DATE — one shared value so nobody disagrees about what is overdue.';
COMMENT ON COLUMN ee.tracker_settings.window_days IS
  'Brief §30: the WIO → PIO window in calendar days. 15.';
COMMENT ON COLUMN ee.tracker_settings.at_risk_from IS
  'Days-left at or below which a running WIO reads "At risk".';

-- ---------------------------------------------------------------------
-- ee.tracker_stages — the workflow definition itself, ORDERED.
--
--   `position` carries the order, and order is load-bearing: "the next stage
--   and who it goes to" is read straight off it. `done_by` is how many days
--   BEFORE the PIO-due date this stage must have cleared — so it counts DOWN
--   the chain (14 at the first stage, 0 at PIO), which is why it is not a
--   duration and cannot be summed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ee.tracker_stages (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  position   INTEGER NOT NULL,
  stage      VARCHAR(80) NOT NULL UNIQUE,
  waiting_on VARCHAR(120) NOT NULL,
  done_by    INTEGER NOT NULL CHECK (done_by >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (position)
);

COMMENT ON COLUMN ee.tracker_stages.done_by IS
  'Days before the PIO-due date by which this stage must have cleared. Counts '
  'DOWN the chain (14 → 0), so it is a deadline offset, never a duration.';
COMMENT ON COLUMN ee.tracker_stages.waiting_on IS
  'Who holds a WIO sitting at this stage. At the final PIO stage this is a '
  'placeholder — accountability there resolves to the WIO''s raised_by.';

-- ---------------------------------------------------------------------
-- ee.tracker_delay_reasons — the Delays dropdown. `cause` and `source` are
-- carried ON the reason so the log cannot drift: picking a reason fills both,
-- and a later re-classification of a reason is one UPDATE here.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ee.tracker_delay_reasons (
  reason     VARCHAR(120) PRIMARY KEY,
  cause      VARCHAR(60) NOT NULL,
  source     VARCHAR(30) NOT NULL CHECK (source IN ('Client', 'Internal', 'Vendor')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- ee.tracker_people — names offered on "raised by" / "owner".
--
--   Deliberately NOT a FK to public.users. The board names people who have no
--   portal account (a client contact, a vendor's draughtsman) and the original
--   list is exactly what the team types today. Forcing it through the user
--   directory would silently drop those names. When staff accounts land, a
--   user_id may be attached alongside — it is not required for the name to work.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ee.tracker_people (
  name       VARCHAR(120) PRIMARY KEY,
  user_id    UUID REFERENCES public.users(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- ee.tracker_wios — one row per tracked work item.
--
--   `wio_number` is the ED/YY-YY/NNN form the team already uses on this board.
--   It is NOT FK'd to ee.projects.project_code: several rows on the live sheet
--   name a scope with no project yet, and a FK would make those rows
--   unrecordable. The board's job is to show the real backlog, including the
--   parts that are not tidy (ADR-HS-01, honest state).
--
--   `wio_issued` NULL is a real and common state — it means the 15-day clock
--   has not started, which the board reports as "Not tracked" / "Add the WIO
--   date" rather than pretending the item is on time. 33 of the 37 seeded rows
--   are in exactly this state, and that is the finding, not a data problem.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ee.tracker_wios (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wio_number   VARCHAR(40) NOT NULL UNIQUE,
  project      VARCHAR(200),
  scope        TEXT,
  raised_by    VARCHAR(120),
  wio_issued   DATE,
  stage_id     UUID NOT NULL REFERENCES ee.tracker_stages(id),
  since        DATE,
  notes        TEXT,
  pio_released DATE,
  pio_no       VARCHAR(40),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ee.tracker_wios IS
  'WIO → PIO tracker rows (§30). Status, days-left and accountability are '
  'DERIVED from stage_id + since + wio_issued at read time — never stored.';
COMMENT ON COLUMN ee.tracker_wios.since IS
  'The date this row entered its CURRENT stage. Re-stamped every time the '
  'stage changes; that pairing is the entire daily job.';

-- ---------------------------------------------------------------------
-- ee.tracker_delays — the "why is it stuck" log.
--
--   Independent of the computed status on purpose. A WIO can read On track
--   and still carry an open delay, and that combination is worth seeing —
--   collapsing the two would hide the early warning. Open delays do feed the
--   priority sort (+5 each), which is the only place the two meet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ee.tracker_delays (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  wio_id     UUID NOT NULL REFERENCES ee.tracker_wios(id) ON DELETE CASCADE,
  why        VARCHAR(120) NOT NULL REFERENCES ee.tracker_delay_reasons(reason),
  cause      VARCHAR(60) NOT NULL,
  source     VARCHAR(30) NOT NULL,
  owner      VARCHAR(120),
  dept       VARCHAR(80),
  started    DATE,
  ended      DATE,
  days_lost  INTEGER,
  status     VARCHAR(10) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  remark     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (ended IS NULL OR started IS NULL OR ended >= started)
);

COMMENT ON COLUMN ee.tracker_delays.cause IS
  'Copied from the chosen reason at log time. Denormalised on purpose: a later '
  're-classification of the reason must not silently rewrite history.';

-- The two hot reads: the board itself (worst-first over every running row),
-- and the open-delay count joined onto it.
CREATE INDEX IF NOT EXISTS idx_tracker_wios_stage
  ON ee.tracker_wios (stage_id);
CREATE INDEX IF NOT EXISTS idx_tracker_wios_running
  ON ee.tracker_wios (wio_issued)
  WHERE pio_released IS NULL;
CREATE INDEX IF NOT EXISTS idx_tracker_delays_wio_open
  ON ee.tracker_delays (wio_id)
  WHERE status = 'Open';

-- =====================================================================
-- RBAC — Ruby's ruling, 2026-08-31:
--   "only dipmalya and neeraj's team can see it all and edit,
--    crm team can view, monica mam can view the dashboard on her portal"
--
-- Three tiers, expressed as ROWS so the business retunes them without a
-- deploy (ADR-EP-01):
--
--   1. The board's owning departments  → read + create + edit (+ delete).
--   2. CRM                             → read only. They are named all over
--                                        the chain ("Roopdeep + CRM", "CRM ·
--                                        PIO not raised") and must see where
--                                        a WIO is standing, but the board is
--                                        not theirs to move.
--   3. Monica (MD) is L0 and Hardesh L0, leadership L1 → read, granted below.
--      db/004 generates L0/L1 rows by CROSS JOIN over resource_types AT THAT
--      TIME, so a resource type added later gets NOTHING unless it is granted
--      here. Without these rows Monica's dashboard would read empty — the
--      exact trap db/029 hit with the Country Head.
--
-- WHO THE OWNING TEAM IS (Ruby, confirmed 2026-08-31):
--   "dipmallya and neeraj have two teams in wio team, both handle the projects
--    of dhruv's team (dipmallya) and neeru's team (neeraj)"
--
--   So the owning department is exactly ONE — DRAFTING, 'WIO / GFC Drafting'
--   (§30, Jyoti Yadav's team). Dipmallya and Neeraj run two teams INSIDE it,
--   split by whose project portfolio they serve:
--
--       Dipmallya's team  →  Dhruv Kelaya's CRM projects
--       Neeraj's team     →  Neeru Bajaj's CRM projects
--
--   Dhruv and Neeru are the two CRM Team Leads in CRM_EE (§26/§39), which is
--   why CRM gets the view tier below: they own the projects these WIOs serve,
--   so they must see where each one is standing — and why they cannot move it.
--
--   An earlier draft of this file granted edit to five departments (DRAFTING,
--   INTERIOR, ARCH, 3D, FFE) on the assumption that everyone named in the stage
--   chain owned the board. That was wrong and is corrected here: INTERIOR,
--   ARCH, 3D and FFE appear in ee.tracker_stages.waiting_on because they HOLD
--   stages. Holding a stage is being tracked BY this board, not owning it.
--   Waiting-on is not a grant.
--
--   The two teams are not modelled as separate departments because they are not
--   separate departments — they are two teams within DRAFTING, and the portal's
--   org model stops at department. If the board ever needs to say WHICH of the
--   two a row belongs to, that is a column on ee.tracker_wios, not a split in
--   these grants.
--
--   Retuning stays a one-statement job — no code change:
--     DELETE FROM public.permissions WHERE resource_type = 'wio_tracker'
--       AND department_id IS NOT NULL;
--     -- then re-run the two INSERTs below with the correct codes.
-- =====================================================================

INSERT INTO public.resource_types (code, name, domain, is_financial, is_hr) VALUES
  ('wio_tracker', 'WIO → PIO Tracker', 'ee', FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

-- Tier 3 — leadership. Read-only: the founders watch this board, they do not
-- work it. Monica's dashboard depends on this row existing.
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
VALUES
  ('L0', 'wio_tracker', 'read', TRUE, 'all',
   'Monica / Hardesh: the Today board is a founder read. L0 rows are NOT auto-generated for resource types added after db/004.'),
  ('L0', 'wio_tracker', 'export', TRUE, 'all', 'L0 founders: unrestricted export'),
  ('L1', 'wio_tracker', 'read', TRUE, 'all',
   'Senior leadership watch the WIO → PIO window across teams'),
  ('L1', 'wio_tracker', 'export', TRUE, 'all', NULL)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Tier 1 — the WIO team: full working control, at both L2 and L3.
-- L3 is granted edit on purpose. The person who moves a WIO along the chain
-- every morning is a team member, not the HOD; a board only a TL can touch is
-- a board that goes stale by Wednesday. Both Dipmallya's and Neeraj's teams sit
-- inside DRAFTING, so one department code covers both.
INSERT INTO public.permissions (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT lvl.level::access_level, d.id, 'wio_tracker', act.code, TRUE, 'own_dept',
       'WIO team (Ruby, 2026-08-31): Dipmallya''s and Neeraj''s teams both sit in DRAFTING — they see all and edit'
FROM public.departments d
CROSS JOIN (VALUES ('L2'), ('L3')) AS lvl(level)
CROSS JOIN (VALUES ('read'), ('create'), ('edit'), ('delete'), ('export')) AS act(code)
WHERE d.code = 'DRAFTING'
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Tier 2 — CRM (Dhruv's and Neeru's teams): read only. The explicit
-- allowed=FALSE rows are not noise; they are the policy written down. A missing
-- row also denies, but says nothing about whether anyone decided. These say
-- someone decided.
INSERT INTO public.permissions (access_level, department_id, resource_type, action_code, allowed, scope, notes)
SELECT lvl.level::access_level, d.id, 'wio_tracker', act.code, act.ok, 'own_dept', act.note
FROM public.departments d
CROSS JOIN (VALUES ('L2'), ('L3')) AS lvl(level)
CROSS JOIN (VALUES
  ('read',   TRUE,  'CRM view-only (Ruby, 2026-08-31): Dhruv''s and Neeru''s teams own the projects these WIOs serve, and CRM is named at four stages — they must see where a WIO stands'),
  ('create', FALSE, 'SECURITY RULE: the board is not CRM''s to add to — raise it with the owning team'),
  ('edit',   FALSE, 'SECURITY RULE: CRM may not move a stage or re-stamp `since`'),
  ('delete', FALSE, 'SECURITY RULE: view-only')
) AS act(code, ok, note)
WHERE d.code = 'CRM_EE'
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Anyone may log a delay against a WIO THEY CAN READ. Recording why something
-- is stuck is not editing the board, and the person who knows the reason is
-- routinely not on the owning team. Gated as its own resource so it can be
-- withdrawn without touching the board grants.
--
-- The read requirement is NOT expressed in these rows — it cannot be, since a
-- permission row governs one resource. The service enforces it: createDelay and
-- updateDelay require read on `wio_tracker` BEFORE this grant is consulted.
-- Without that, a department fenced out of the tracker entirely (Site, say)
-- would still be able to write rows onto it — a hole, not a wider grant. If
-- these rows are ever re-scoped, keep that check.
INSERT INTO public.resource_types (code, name, domain, is_financial, is_hr) VALUES
  ('wio_tracker_delay', 'WIO Tracker · Delay Log', 'ee', FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
VALUES
  ('L0', 'wio_tracker_delay', 'read',   TRUE, 'all', NULL),
  ('L0', 'wio_tracker_delay', 'create', TRUE, 'all', NULL),
  ('L0', 'wio_tracker_delay', 'edit',   TRUE, 'all', NULL),
  ('L1', 'wio_tracker_delay', 'read',   TRUE, 'all', NULL),
  ('L1', 'wio_tracker_delay', 'create', TRUE, 'all', NULL),
  ('L1', 'wio_tracker_delay', 'edit',   TRUE, 'all', NULL),
  ('L2', 'wio_tracker_delay', 'read',   TRUE, 'own_dept', 'Whoever can read the board can read why it is stuck'),
  ('L2', 'wio_tracker_delay', 'create', TRUE, 'own_dept', 'CRM included: the person who knows the reason logs it'),
  ('L2', 'wio_tracker_delay', 'edit',   TRUE, 'own_dept', 'Closing a delay is the point of logging it'),
  ('L3', 'wio_tracker_delay', 'read',   TRUE, 'own_dept', NULL),
  ('L3', 'wio_tracker_delay', 'create', TRUE, 'own_dept', NULL),
  ('L3', 'wio_tracker_delay', 'edit',   TRUE, 'own_dept', NULL)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Only the owning departments and leadership retune the chain itself. A
-- `done_by` day or the 15-day window is a policy change, not a daily edit.
INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('tracker.owning_departments',
   '["DRAFTING"]',
   'delivery',
   'Departments that own the WIO → PIO Tracker board (read + edit). The WIO team '
   '— Dipmallya''s and Neeraj''s teams both sit inside DRAFTING (Ruby, confirmed '
   '2026-08-31). Mirrors the department-scoped rows in public.permissions for '
   'resource_type wio_tracker — update BOTH together.'),
  -- The two teams inside DRAFTING are modelled properly in db/032
  -- (ee.tracker_teams + ee.tracker_wios.team_code), not as config.
  ('tracker.setup_min_level', '"L2"', 'delivery',
   'Minimum access level permitted to edit the stage chain, window days and '
   'at-risk threshold on the Setup screen. Moving a done_by day is policy.')
ON CONFLICT (key) DO NOTHING;
