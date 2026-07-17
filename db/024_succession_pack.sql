-- =====================================================================
-- 024 — SUCCESSION PACK (Brief §36 · Velocity Gate #7)
--   "Succession pack auto-generates when an exit date is confirmed in Keka. The
--   successor does not wait for a briefing." Generated same-day on confirmation,
--   NOT at 11:59pm (that is the removal protocol, db/023).
--
--   CONFIGURATION-DRIVEN BY DESIGN. The pack's contents are DATA, not code:
--   portal.succession_pack_sections is the template — HR adds, removes, reorders,
--   relabels and re-words sections with row edits and never a deploy. Code holds
--   only a small registry of `source_kind` RESOLVERS (the same pattern as the
--   notification recipient strategies and the scheduler handler registry):
--
--     checklist          — items come entirely from params.items[]  (pure data)
--     documents          — items come entirely from params.items[]  (pure data)
--     static_note        — params.text                              (pure data)
--     pending_approvals  — resolved live: the leaver's open approvals
--     project_ownership  — resolved live: projects they are named on
--
--   params.items and params.text support {{name}}, {{jobTitle}}, {{exitDate}}.
--   A brand-new DYNAMIC source needs a new resolver (one registry entry); every
--   other change HR will want is a row edit.
--
--   ROLLBACK: DELETE FROM portal.scheduled_jobs WHERE name='succession-pack';
--             DROP TABLE portal.succession_packs, portal.succession_pack_sections;
-- =====================================================================

-- ---------------------------------------------------------------------
-- THE TEMPLATE — HR's surface. One row per section of the pack.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.succession_pack_sections (
  code        VARCHAR(50) PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  source_kind VARCHAR(40) NOT NULL,          -- resolver key (registry in code)
  params      JSONB NOT NULL DEFAULT '{}',   -- HR-owned content for this section
  sort_order  INTEGER NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT
);

-- ---------------------------------------------------------------------
-- THE GENERATED PACK — one per person per exit, a resolved snapshot so the
-- briefing the successor reads never changes under them.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal.succession_packs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id),
  exit_date    DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES public.users(id),
  sections     JSONB NOT NULL DEFAULT '[]',
  UNIQUE (user_id, exit_date)
);
CREATE INDEX IF NOT EXISTS idx_succession_packs_user
  ON portal.succession_packs (user_id, exit_date);

-- ---------------------------------------------------------------------
-- SEED the default template. Every one of these is editable by HR as data.
-- ---------------------------------------------------------------------
INSERT INTO portal.succession_pack_sections (code, title, source_kind, params, sort_order, description) VALUES
  ('successor_briefing', 'Briefing', 'static_note',
   '{"text": "{{name}} ({{jobTitle}}) leaves on {{exitDate}}. This pack is the successor''s briefing — read it before the handover conversation, not after."}'::jsonb,
   10, 'Opening note. HR owns the wording.'),

  ('project_ownership', 'Project ownership to reassign', 'project_ownership',
   '{}'::jsonb,
   20, 'Resolved live: every project this person is named on, with their role. Brief §37: nothing may be left unowned.'),

  ('pending_approvals', 'Approvals awaiting this person', 'pending_approvals',
   '{}'::jsonb,
   30, 'Resolved live: open workflow decisions that will stall on exit.'),

  ('handover_documents', 'Documents to hand over', 'documents',
   '{"items": ["Role handbook and standard operating procedures", "Active contracts, WOs and POs owned by {{name}}", "Vendor and client contact sheet", "Access list: systems, folders, shared drives"]}'::jsonb,
   40, 'Document checklist. HR edits params.items.'),

  ('knowledge_transfer', 'Knowledge transfer', 'checklist',
   '{"items": ["Record a 30-minute walkthrough of live work and upload to the Knowledge Library", "Write up the in-flight decisions a successor could not infer from the portal", "Name the relationships that need a warm introduction", "Confirm the Knowledge Library entries are current"]}'::jsonb,
   50, 'Wednesday Year / Knowledge Library capture. HR edits params.items.'),

  ('handover_checklist', 'Handover checklist', 'checklist',
   '{"items": ["Successor named and confirmed", "Handover conversation scheduled before {{exitDate}}", "Reporting Manager sign-off", "Ila Tomar (HR) sign-off"]}'::jsonb,
   60, 'Sign-off checklist. HR edits params.items.')
ON CONFLICT (code) DO NOTHING;

-- Same-day generation on exit-date confirmation (Brief §36), not the 23:59 sweep.
INSERT INTO portal.scheduled_jobs
  (name, description, schedule_kind, schedule_expr, enabled, max_attempts, backoff_base_seconds) VALUES
  ('succession-pack',
   'Generate the succession pack the day an exit date is confirmed, from the portal.succession_pack_sections template — Velocity Gate #7.',
   'daily', '06:00', TRUE, 3, 300)
ON CONFLICT (name) DO NOTHING;
