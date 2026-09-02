-- =====================================================================
-- 004 — FOUNDATION ARCHITECTURE
-- Ruling: Monica Chawla, 2026-07-06 (foundation freeze before WIO/PIO Hub)
--   1. Department Master is the single source of truth (24 seeded in 002)
--   2. Factory = 7 named stations + 2 reserved, data-driven
--   3. RBAC: configurable permission engine, 12 actions, DB-controlled
--   4. Global security rules enforced as data, exceptions documented
-- Supersedes 003_seed_roles.sql (interim matrix on the old table shape).
-- Idempotent: ON CONFLICT / IF NOT EXISTS guards throughout.
-- =====================================================================

-- =====================================================================
-- A. DEPARTMENT MASTER — public.departments is the master; wire dependents
-- =====================================================================

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- WIO routing must reference the master — no hardcoded department strings.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_wio_department'
  ) THEN
    ALTER TABLE ee.wio
      ADD CONSTRAINT fk_wio_department
      FOREIGN KEY (department_code) REFERENCES public.departments(code);
  END IF;
END $$;

-- Hierarchy: factory-support departments sit under the FACTORY umbrella.
-- (Assumption A-01 in docs/ASSUMPTIONS_DECISIONS.md — brief implies, never states.)
UPDATE public.departments
SET parent_id = (SELECT id FROM public.departments WHERE code = 'FACTORY')
WHERE code IN ('PPC', 'QC', 'STORE', 'PACKING') AND parent_id IS NULL;

-- =====================================================================
-- B. FACTORY MASTER — 7 named stations + 2 reserved; extensible via data
-- =====================================================================

ALTER TABLE factory.departments
  ADD COLUMN IF NOT EXISTS code       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS station_no INTEGER,
  ADD COLUMN IF NOT EXISTS status     VARCHAR(30) DEFAULT 'active', -- active | reserved
  ADD COLUMN IF NOT EXISTS notes      TEXT;

UPDATE factory.departments SET code = 'CARP',   station_no = 1 WHERE name = 'Carpentry'   AND code IS NULL;
UPDATE factory.departments SET code = 'METAL',  station_no = 2 WHERE name = 'Metal'       AND code IS NULL;
UPDATE factory.departments SET code = 'STONE',  station_no = 3 WHERE name = 'Stone & CNC' AND code IS NULL;
UPDATE factory.departments SET code = 'UPH',    station_no = 4 WHERE name = 'Upholstery'  AND code IS NULL;
UPDATE factory.departments SET code = 'POLISH', station_no = 5 WHERE name = 'Polish'      AND code IS NULL;
UPDATE factory.departments SET code = 'FIT',    station_no = 6 WHERE name = 'Fittings'    AND code IS NULL;
UPDATE factory.departments SET code = 'ASSY',   station_no = 7 WHERE name = 'Assembly'    AND code IS NULL;

-- Ruling #2: do not invent stations 8-9 — reserve the slots as data.
INSERT INTO factory.departments (name, code, station_no, status, notes)
SELECT v.name, v.code, v.station_no, 'reserved', 'Awaiting Business Confirmation — brief says "9 Depts" (§10/§12) but names only 7 stations (§26/§39).'
FROM (VALUES
  ('Reserved Station 8', 'RES8', 8),
  ('Reserved Station 9', 'RES9', 9)
) AS v(name, code, station_no)
WHERE NOT EXISTS (SELECT 1 FROM factory.departments d WHERE d.code = v.code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_factory_code') THEN
    ALTER TABLE factory.departments ADD CONSTRAINT uq_factory_code UNIQUE (code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_factory_station') THEN
    ALTER TABLE factory.departments ADD CONSTRAINT uq_factory_station UNIQUE (station_no);
  END IF;
END $$;

-- =====================================================================
-- C. RBAC — CONFIGURABLE PERMISSION ENGINE (ruling #3)
-- Permissions live in tables; changes are configuration, not code.
-- Deny-by-default: no matching row means not allowed.
-- Resolution: (level, department, resource, action) beats (level, NULL, …).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.permission_actions (
  code        VARCHAR(30) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0
);

INSERT INTO public.permission_actions (code, name, description, sort_order) VALUES
  ('read',             'Read',             'View records',                                        1),
  ('create',           'Create',           'Create new records',                                  2),
  ('edit',             'Edit',             'Modify existing records',                             3),
  ('delete',           'Delete',           'Remove records',                                      4),
  ('approve',          'Approve',          'Approve documents / steps',                           5),
  ('reject',           'Reject',           'Reject documents / steps',                            6),
  ('assign',           'Assign',           'Assign work or ownership',                            7),
  ('escalate',         'Escalate',         'Raise to the next authority',                         8),
  ('export',           'Export',           'Export data out of the portal',                       9),
  ('ai_access',        'AI Access',        'Invoke AI services (drafting, search, signals)',     10),
  ('financial_access', 'Financial Access', 'See amounts, invoices, fees, AR',                    11),
  ('hr_access',        'HR Access',        'See people data beyond the directory',               12)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.resource_types (
  code         VARCHAR(50) PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  domain       VARCHAR(30) NOT NULL,             -- ee | eh | factory | proc | portal | shared | audit
  is_financial BOOLEAN DEFAULT FALSE,
  is_hr        BOOLEAN DEFAULT FALSE
);

INSERT INTO public.resource_types (code, name, domain, is_financial, is_hr) VALUES
  ('projects',            'EE Projects',              'ee',      FALSE, FALSE),
  ('families',            'Family Profiles',          'shared',  FALSE, FALSE),
  ('wio',                 'Work Initiation Orders',   'ee',      FALSE, FALSE),
  ('pio',                 'Production Initiation',    'ee',      FALSE, FALSE),
  ('visioncam',           'VisionCAM Photos',         'ee',      FALSE, FALSE),
  ('billing',             'Billing Milestones / AR',  'ee',      TRUE,  FALSE),
  ('procurement',         'Vendors / POs / GRNs',     'proc',    TRUE,  FALSE),
  ('work_orders',         'Work Orders',              'proc',    TRUE,  FALSE),
  ('eh_sales',            'EH Sales',                 'eh',      TRUE,  FALSE),
  ('factory',             'Factory Stations / PIOs',  'factory', FALSE, FALSE),
  ('knowledge_library',   'Knowledge Library',        'portal',  FALSE, FALSE),
  ('communication_spine', 'Communication Spine',      'portal',  FALSE, FALSE),
  ('notifications',       'Notifications',            'portal',  FALSE, FALSE),
  ('api_health',          'API Health',               'portal',  FALSE, FALSE),
  ('founder_brief',       'Founder Morning Brief',    'portal',  TRUE,  FALSE),
  ('audit_log',           'Audit Trail',              'audit',   FALSE, FALSE),
  ('departments',         'Department Master',        'shared',  FALSE, FALSE),
  ('users',               'Users / Directory',        'shared',  FALSE, TRUE),
  ('ai',                  'AI Services',              'portal',  FALSE, FALSE),
  ('config',              'App Configuration',        'portal',  FALSE, FALSE),
  ('workflows',           'Workflow Instances',       'portal',  FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.permissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  access_level  access_level NOT NULL,
  department_id UUID REFERENCES public.departments(id),  -- NULL = global default for the level
  resource_type VARCHAR(50) NOT NULL REFERENCES public.resource_types(code),
  action_code   VARCHAR(30) NOT NULL REFERENCES public.permission_actions(code),
  allowed       BOOLEAN NOT NULL DEFAULT FALSE,
  scope         VARCHAR(20) NOT NULL DEFAULT 'own_dept'
                CHECK (scope IN ('all', 'own_dept', 'own_records')),
  notes         TEXT,                                    -- provenance / documented exception
  updated_by    UUID REFERENCES public.users(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (access_level, department_id, resource_type, action_code)
);
CREATE INDEX IF NOT EXISTS idx_perm_lookup
  ON public.permissions (access_level, resource_type, action_code);

-- The interim boolean matrix is superseded by the engine above.
DROP TABLE IF EXISTS public.role_permissions;

-- ------------------------------------------------------------------
-- Matrix seeds. L0/L1 generated (see everything, per the access model);
-- L2/L3 explicit rows; the four global security rules (ruling #4)
-- carry explicit allowed=FALSE rows so the policy is self-documenting.
-- ------------------------------------------------------------------

-- L0 Founders: unrestricted, except the audit trail is immutable for everyone.
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT 'L0', r.code, a.code, TRUE, 'all', 'L0 founders: unrestricted (access-level fencing)'
FROM public.resource_types r CROSS JOIN public.permission_actions a
WHERE NOT (r.code = 'audit_log' AND a.code <> 'read')
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- L1 Senior leadership: read/act on everything; founder brief read-only;
-- audit read-only.
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT 'L1', r.code, a.code, TRUE, 'all', 'L1 senior leadership (access-level fencing; §26 Deepak Ji signs PIOs, §36 Amit approves EH discounts)'
FROM public.resource_types r CROSS JOIN public.permission_actions a
WHERE NOT (r.code = 'audit_log'     AND a.code <> 'read')
  AND NOT (r.code = 'founder_brief' AND a.code <> 'read')
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- L2 HODs / Team Leads
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT 'L2', v.res, v.act, v.ok, v.scope, v.note
FROM (VALUES
  ('projects',            'read',             TRUE,  'own_dept',    NULL),
  ('projects',            'create',           TRUE,  'own_dept',    NULL),
  ('projects',            'edit',             TRUE,  'own_dept',    NULL),
  ('projects',            'assign',           TRUE,  'own_dept',    NULL),
  ('projects',            'escalate',         TRUE,  'own_dept',    NULL),
  ('projects',            'export',           TRUE,  'own_dept',    NULL),
  ('families',            'read',             TRUE,  'own_dept',    '§5: Family Profile visible to Design Lead / CRM TL / Monica / HOD'),
  ('families',            'edit',             TRUE,  'own_dept',    '§5'),
  ('wio',                 'read',             TRUE,  'own_dept',    NULL),
  ('wio',                 'create',           TRUE,  'own_dept',    '§30: TL owns the 15-day conversion window'),
  ('wio',                 'edit',             TRUE,  'own_dept',    NULL),
  ('wio',                 'approve',          TRUE,  'own_dept',    NULL),
  ('wio',                 'assign',           TRUE,  'own_dept',    NULL),
  ('wio',                 'escalate',         TRUE,  'own_dept',    NULL),
  ('pio',                 'read',             TRUE,  'own_dept',    NULL),
  ('pio',                 'create',           TRUE,  'own_dept',    NULL),
  ('pio',                 'edit',             TRUE,  'own_dept',    NULL),
  ('pio',                 'approve',          FALSE, 'own_dept',    'SECURITY RULE (§26): PIO approval chain is Khushpreet → Deepak Ji → Hardesh — enforced by the pio_approval workflow, never at L2'),
  ('visioncam',           'read',             TRUE,  'own_dept',    NULL),
  ('visioncam',           'create',           TRUE,  'own_dept',    NULL),
  ('billing',             'read',             TRUE,  'own_dept',    '§16: TL reviews and releases VisionCAM-triggered milestone invoices'),
  ('billing',             'edit',             TRUE,  'own_dept',    '§16'),
  ('billing',             'financial_access', TRUE,  'own_dept',    NULL),
  ('procurement',         'read',             TRUE,  'own_dept',    NULL),
  ('procurement',         'create',           TRUE,  'own_dept',    NULL),
  ('procurement',         'edit',             TRUE,  'own_dept',    NULL),
  ('work_orders',         'read',             TRUE,  'own_dept',    NULL),
  ('work_orders',         'create',           TRUE,  'own_dept',    NULL),
  ('work_orders',         'edit',             TRUE,  'own_dept',    NULL),
  ('eh_sales',            'read',             TRUE,  'own_dept',    NULL),
  ('eh_sales',            'create',           TRUE,  'own_dept',    NULL),
  ('eh_sales',            'edit',             TRUE,  'own_dept',    NULL),
  ('factory',             'read',             TRUE,  'own_dept',    NULL),
  ('factory',             'edit',             TRUE,  'own_dept',    NULL),
  ('knowledge_library',   'read',             TRUE,  'all',         'Wednesday Year is org-wide'),
  ('knowledge_library',   'create',           TRUE,  'all',         NULL),
  ('communication_spine', 'read',             TRUE,  'own_dept',    NULL),
  ('communication_spine', 'create',           TRUE,  'own_dept',    NULL),
  ('communication_spine', 'edit',             TRUE,  'own_dept',    NULL),
  ('communication_spine', 'approve',          TRUE,  'own_dept',    '§28: TL reviews and sends'),
  ('notifications',       'read',             TRUE,  'own_records', NULL),
  ('notifications',       'edit',             TRUE,  'own_records', NULL),
  ('api_health',          'read',             TRUE,  'all',         NULL),
  ('departments',         'read',             TRUE,  'all',         NULL),
  ('users',               'read',             TRUE,  'own_dept',    NULL),
  ('users',               'hr_access',        FALSE, 'own_dept',    'SECURITY RULE (§36): people data beyond the directory is HR/L1+'),
  ('ai',                  'ai_access',        TRUE,  'own_dept',    NULL),
  ('workflows',           'read',             TRUE,  'own_dept',    NULL),
  ('audit_log',           'read',             FALSE, 'own_dept',    'Audit trail is L0/L1 only'),
  ('founder_brief',       'read',             FALSE, 'own_dept',    'Founder brief is L0/L1 only (Brief §37)')
) AS v(res, act, ok, scope, note)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- L3 Team members
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
SELECT 'L3', v.res, v.act, v.ok, v.scope, v.note
FROM (VALUES
  ('projects',            'read',             TRUE,  'own_dept',    NULL),
  ('families',            'read',             FALSE, 'own_dept',    'SECURITY RULE (§5): Family Profile is never visible below HOD/TL'),
  ('wio',                 'read',             TRUE,  'own_dept',    NULL),
  ('wio',                 'create',           TRUE,  'own_dept',    NULL),
  ('pio',                 'read',             TRUE,  'own_dept',    NULL),
  ('visioncam',           'read',             TRUE,  'own_records', NULL),
  ('visioncam',           'create',           TRUE,  'own_records', 'Site teams capture live photos (§39 anti-busy rule 1)'),
  ('billing',             'read',             FALSE, 'own_dept',    'SECURITY RULE (§36): a junior CRM does not see Accounts data'),
  ('billing',             'financial_access', FALSE, 'own_dept',    'SECURITY RULE (§36)'),
  ('eh_sales',            'read',             TRUE,  'own_dept',    'CAs record their sales'),
  ('eh_sales',            'create',           TRUE,  'own_dept',    NULL),
  ('knowledge_library',   'read',             TRUE,  'all',         'Wednesday Year is org-wide'),
  ('notifications',       'read',             TRUE,  'own_records', NULL),
  ('notifications',       'edit',             TRUE,  'own_records', NULL),
  ('departments',         'read',             TRUE,  'all',         NULL),
  ('ai',                  'ai_access',        TRUE,  'own_records', 'Knowledge search available to all staff'),
  ('workflows',           'read',             TRUE,  'own_records', NULL)
) AS v(res, act, ok, scope, note)
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- =====================================================================
-- D. WORKFLOW ENGINE — approval chains as data
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.workflow_definitions (
  code          VARCHAR(50) PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  resource_type VARCHAR(50) REFERENCES public.resource_types(code),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal.workflow_steps (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_code    VARCHAR(50) NOT NULL REFERENCES portal.workflow_definitions(code) ON DELETE CASCADE,
  step_no          INTEGER NOT NULL,
  name             VARCHAR(200) NOT NULL,
  approver_type    VARCHAR(20) NOT NULL CHECK (approver_type IN ('user', 'access_level')),
  approver_user_id UUID REFERENCES public.users(id),   -- NULL until Keka import maps the person
  approver_level   access_level,
  approver_hint    VARCHAR(200),                        -- human-readable approver until mapped
  UNIQUE (workflow_code, step_no)
);

CREATE TABLE IF NOT EXISTS portal.workflow_instances (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_code VARCHAR(50) NOT NULL REFERENCES portal.workflow_definitions(code),
  resource_type VARCHAR(50) NOT NULL,
  resource_id   UUID NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  current_step  INTEGER NOT NULL DEFAULT 1,
  started_by    UUID REFERENCES public.users(id),
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
-- One live approval per document.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_active
  ON portal.workflow_instances (workflow_code, resource_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS portal.workflow_actions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id UUID NOT NULL REFERENCES portal.workflow_instances(id) ON DELETE CASCADE,
  step_no     INTEGER NOT NULL,
  action      VARCHAR(10) NOT NULL CHECK (action IN ('approve', 'reject')),
  acted_by    UUID REFERENCES public.users(id),
  comments    TEXT,
  acted_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Ruling #4: the PIO approval chain, as data. approver_user_id links when
-- the named people are imported from Keka; until then act() refuses with
-- "approver unresolved" rather than letting anyone through.
INSERT INTO portal.workflow_definitions (code, name, resource_type) VALUES
  ('pio_approval', 'PIO Approval — Triangle check to factory release', 'pio')
ON CONFLICT (code) DO NOTHING;

INSERT INTO portal.workflow_steps (workflow_code, step_no, name, approver_type, approver_hint) VALUES
  ('pio_approval', 1, 'Production Head sign-off', 'user', 'Khushpreet Arora — Production Head (§26)'),
  ('pio_approval', 2, 'COO sign-off',             'user', 'Deepak Jain (Deepak Ji) — COO (§26)'),
  ('pio_approval', 3, 'CEO final signature',      'user', 'Hardesh Chawla — CEO (§26)')
ON CONFLICT (workflow_code, step_no) DO NOTHING;

-- =====================================================================
-- E. NOTIFICATION FRAMEWORK — templates as data ({{var}} placeholders)
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.notification_templates (
  code                VARCHAR(50) PRIMARY KEY,
  tier                notif_tier NOT NULL,
  title_template      VARCHAR(300) NOT NULL,
  body_template       TEXT,
  action_url_template TEXT,
  action_label        VARCHAR(100),
  default_channels    JSONB DEFAULT '["app"]',
  is_active           BOOLEAN DEFAULT TRUE,
  description         TEXT
);

INSERT INTO portal.notification_templates
  (code, tier, title_template, body_template, action_url_template, action_label, description) VALUES
  ('wio_day12_alert', 'action_required',
   'WIO {{wioNumber}} — day 12 of 15',
   '{{projectCode}} · {{department}}: three days left on the conversion clock. Convert to PIO or document the restart.',
   '/wio-pio', 'Open WIO', 'Brief §30: day-12 alert on the 15-day window'),
  ('wio_overdue', 'urgent',
   'WIO {{wioNumber}} past the 15-day clock',
   '{{projectCode}} · {{department}}: the conversion window has lapsed. A documented restart is required.',
   '/wio-pio', 'Open WIO', 'Brief §30: day-15 lapse'),
  ('weekly_pulse_missing', 'action_required',
   'Weekly Pulse pending — {{projectCode}}',
   'The Friday pulse for {{familyName}} has not been sent this week. Auto-draft is ready for review.',
   '/communication', 'Review pulse', 'Velocity Gate 2'),
  ('ar_overdue_45', 'action_required',
   'AR 45 days — {{projectCode}}',
   '{{amount}} outstanding for {{familyName}}. TL follow-up required.',
   '/dashboard#projects', 'View project', 'Brief §36: 45d → TL'),
  ('ar_overdue_60', 'urgent',
   'AR 60 days — {{projectCode}}',
   '{{amount}} outstanding. Escalated to Deepak Ji.',
   '/dashboard#projects', 'View project', 'Brief §36: 60d → COO'),
  ('ar_overdue_90', 'urgent',
   'AR 90 days — {{projectCode}}',
   '{{amount}} outstanding. Surfacing in the Founder Morning Brief.',
   '/founder-brief', 'Open brief', 'Brief §36: 90d → founders'),
  ('workflow_step_pending', 'action_required',
   '{{workflowName}} — step {{stepNo}} awaits you',
   '{{resourceRef}} needs your decision: {{stepName}}.',
   '/wio-pio', 'Review', 'Workflow engine step notification'),
  ('family_profile_low', 'action_required',
   'Family Profile {{familyCode}} at {{pct}}',
   'Completeness below 70 shows red to the TL and Deepak Ji until repaired.',
   '/client', 'Open profile', 'Brief §39 anti-busy rule 6'),
  ('generic_report_flag', 'informational',
   'Generic report flagged — {{author}}',
   'Today''s report from {{author}} names no specific milestone or risk. Please review.',
   NULL, NULL, 'Brief §39 anti-busy rule 2'),
  ('late_entry_flag', 'informational',
   'Late entry — {{projectCode}}',
   'Client communication logged {{hours}}h after the event. Three in a month raises a pattern alert.',
   NULL, NULL, 'Brief §39 anti-busy rule 3')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- F. CONFIGURATION SYSTEM — business rules as data (ruling #4/#6)
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.app_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  category    VARCHAR(50),
  description TEXT,
  updated_by  UUID REFERENCES public.users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('rbac.audit_mode', '"denials_and_sensitive"', 'security',
   'Permission-decision logging: all | denials_and_sensitive | sensitive_only'),
  ('ai.provider', '"anthropic"', 'ai',
   'Active AI provider: anthropic | azure_openai | copilot (ruling #5: replaceable)'),
  ('ai.model', '"claude-sonnet-4-6"', 'ai',
   'Default model for the active provider'),
  ('wio.conversion_days', '15', 'delivery', 'Brief §30: WIO → PIO window'),
  ('wio.alert_day', '12', 'delivery', 'Brief §30: day-12 alert'),
  ('ar.escalation_days', '[45, 60, 90]', 'finance', 'Brief §36: TL → Deepak Ji → founders'),
  ('pulse.auto_draft', '{"day": "friday", "hour": 5}', 'communication',
   'Brief §26/§36: auto-draft from the site Saturday Checklist by 5am Friday'),
  ('eh.rimadesio.blocked_departments', '["EH_MUM"]', 'eh',
   'SECURITY RULE (§27): Rimadesio is not sold in Mumbai — the portal blocks Mumbai CAs from generating Rimadesio quotations. Enforced by the EH quote service.'),
  ('exit_protocol.fire_time', '"23:59"', 'people',
   'All six removal actions fire simultaneously at 11:59pm on exit_date'),
  ('notifications.enabled_channels', '["app"]', 'notifications',
   'whatsapp/email activate with the Twilio and Microsoft Graph integrations'),
  ('family_profile.red_threshold', '70', 'crm',
   'Brief §39: completeness below 70 shows red to CRM TL and Deepak Ji'),
  ('keka.department_mapping', '{}', 'people',
   'Keka department name → departments.code, filled at staff import (Department Master is authoritative)')
ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- G. AUDIT — partitions through mid-2027; trail is immutable
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit.log_2026_09 PARTITION OF audit.log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS audit.log_2026_10 PARTITION OF audit.log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS audit.log_2026_11 PARTITION OF audit.log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS audit.log_2026_12 PARTITION OF audit.log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS audit.log_2027_01 PARTITION OF audit.log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS audit.log_2027_02 PARTITION OF audit.log FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS audit.log_2027_03 PARTITION OF audit.log FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS audit.log_2027_04 PARTITION OF audit.log FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS audit.log_2027_05 PARTITION OF audit.log FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS audit.log_2027_06 PARTITION OF audit.log FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

-- Immutable trail: the app role gets INSERT+SELECT only, never UPDATE/DELETE.
REVOKE UPDATE, DELETE ON audit.log FROM PUBLIC;

-- =====================================================================
-- H. AI PROMPT REGISTRY — modular prompts as data (ruling #5)
-- Seeded by the modules that own them (Communication Spine, etc.).
-- =====================================================================

CREATE TABLE IF NOT EXISTS portal.ai_prompts (
  code            VARCHAR(50) PRIMARY KEY,
  purpose         TEXT,
  system_template TEXT NOT NULL,
  user_template   TEXT NOT NULL,
  model_override  VARCHAR(50),
  max_tokens      INTEGER DEFAULT 1024,
  is_active       BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
