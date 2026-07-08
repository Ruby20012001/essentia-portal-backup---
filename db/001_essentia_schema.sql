-- =====================================================================
-- ESSENTIA GROUP PORTAL — COMPLETE DATABASE SCHEMA
-- Version 1.1 · July 2026 — v1.0 contained three statements PostgreSQL
--   rejects outright; fixed so the file loads end-to-end (see db/CHANGELOG.md)
-- Built from Portal Brief Sections 1-39 (916 KB, 39 sections)
-- Every client returns.
-- =====================================================================
-- HOW TO RUN:
--   psql -U postgres -d essentia_portal -f 001_essentia_schema.sql
-- REQUIRES PostgreSQL 15+ and the pgvector extension for Knowledge Library
-- =====================================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector: Knowledge Library semantic search

-- SCHEMAS (one per vertical — L0-L3 fencing enforced at schema level via RLS)
CREATE SCHEMA IF NOT EXISTS ee;        -- essentia environments
CREATE SCHEMA IF NOT EXISTS eh;        -- essentia home
CREATE SCHEMA IF NOT EXISTS factory;   -- NH8 manufacturing
CREATE SCHEMA IF NOT EXISTS proc;      -- procurement
CREATE SCHEMA IF NOT EXISTS portal;    -- intelligence layer
CREATE SCHEMA IF NOT EXISTS audit;     -- immutable trail

-- =====================================================================
-- ENUMS
-- =====================================================================

-- Information fencing (L0 = Founders, L1 = Sr Leadership, L2 = HODs/TLs, L3 = Team)
CREATE TYPE access_level AS ENUM ('L0','L1','L2','L3');

-- EE 9-phase client journey
CREATE TYPE project_phase AS ENUM (
  'discovery',
  'design_conceptualisation',
  'design_development',
  'design_finalisation',
  'procurement',
  'production',
  'site_preparation',
  'installation',
  'day_of_recognition'
);

CREATE TYPE rag_status     AS ENUM ('green','amber','red');
CREATE TYPE wio_status     AS ENUM ('initiated','in_progress','converted_to_pio','on_hold','cancelled');
CREATE TYPE pio_status     AS ENUM ('initiated','in_production','quality_check','ready_for_dispatch','dispatched','installed');
CREATE TYPE doc_status     AS ENUM ('draft','pending_approval','approved','rejected','superseded');
CREATE TYPE notif_tier     AS ENUM ('urgent','action_required','informational');
CREATE TYPE ec_code        AS ENUM ('gurugram_hq','sultanpur_delhi','mumbai_lower_parel');
CREATE TYPE api_name       AS ENUM ('tranzact','hubspot','keka','zakya','whatsapp','microsoft_graph','twilio','monday_com','google_drive','anthropic','visioncam');

CREATE TYPE letter_type AS ENUM (
  'welcome_letter','design_brief_confirmation','concept_presentation_invite',
  'design_approval_request','pmc_appointment_letter','site_mobilisation_notice',
  'weekly_pulse','milestone_completion','delay_notification',
  'material_approval_request','day_of_recognition_invite','recognition_letter',
  'd30_check_in','d90_check_in','first_anniversary',
  'referral_acknowledgement','brand_advocate_invitation','portfolio_feature_request'
);

-- =====================================================================
-- CORE: DEPARTMENTS · USERS · ROLES
-- =====================================================================

CREATE TABLE public.departments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           VARCHAR(30) UNIQUE NOT NULL,  -- 'CRM_EE','FACTORY_CARP','EH_GGN' etc.
  name           VARCHAR(120) NOT NULL,
  vertical       VARCHAR(10) NOT NULL CHECK (vertical IN ('EE','EH','SHARED','FACTORY')),
  parent_id      UUID REFERENCES public.departments(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  microsoft_oid       VARCHAR(255) UNIQUE,          -- Entra ID SSO for staff
  phone               VARCHAR(20) UNIQUE,            -- Twilio OTP for external users
  email               VARCHAR(255) UNIQUE NOT NULL,
  full_name           VARCHAR(200) NOT NULL,
  display_name        VARCHAR(100),
  access_level        access_level NOT NULL DEFAULT 'L3',
  department_id       UUID REFERENCES public.departments(id),
  job_title           VARCHAR(200),
  reports_to          UUID REFERENCES public.users(id),
  keka_employee_id    VARCHAR(50) UNIQUE,            -- Keka HRIS link
  is_active           BOOLEAN DEFAULT TRUE,
  is_external         BOOLEAN DEFAULT FALSE,         -- clients / vendors / brand advocates
  -- Exit protocol (fired by Keka webhook at 11:59pm on exit_date)
  exit_date           DATE,
  exit_protocol_fired BOOLEAN DEFAULT FALSE,
  exit_protocol_at    TIMESTAMPTZ,
  last_login          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- L0-L3 resource permission matrix
CREATE TABLE public.role_permissions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  access_level   access_level NOT NULL,
  department_id  UUID REFERENCES public.departments(id),
  resource_type  VARCHAR(100) NOT NULL,
  can_read       BOOLEAN DEFAULT FALSE,
  can_write      BOOLEAN DEFAULT FALSE,
  can_approve    BOOLEAN DEFAULT FALSE,
  own_dept_only  BOOLEAN DEFAULT TRUE,
  UNIQUE (access_level, department_id, resource_type)
);

-- =====================================================================
-- FAMILY PROFILE (The Client — The Whole Person)
-- =====================================================================

CREATE TABLE public.families (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_code          VARCHAR(50) UNIQUE,          -- generated at first instalment
  primary_contact      VARCHAR(200) NOT NULL,
  secondary_contacts   JSONB DEFAULT '[]',          -- [{name,phone,email,relationship}]
  address              TEXT,
  city                 VARCHAR(100),
  how_they_found_us    VARCHAR(200),
  referred_by_id       UUID REFERENCES public.families(id),
  lifestyle_notes      TEXT,                        -- Monica's intelligence layer
  communication_pref   VARCHAR(20) DEFAULT 'whatsapp',
  anniversary_date     DATE,                        -- first instalment date
  -- Anti-busy-looking: profile completeness visible to TL + Deepak Ji
  profile_complete_pct INTEGER DEFAULT 0 CHECK (profile_complete_pct BETWEEN 0 AND 100),
  brand_advocate       BOOLEAN DEFAULT FALSE,
  ean_member           BOOLEAN DEFAULT FALSE,       -- essentia Advocate Network
  ean_code             VARCHAR(30) UNIQUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.family_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id   UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  portal_user UUID REFERENCES public.users(id),    -- if they have client login
  name        VARCHAR(200) NOT NULL,
  phone       VARCHAR(20),
  email       VARCHAR(255),
  role        VARCHAR(100),                         -- 'primary','spouse','child','parent' etc.
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- PROJECTS (EE) — Project Code ED/YY-YY/NNN is the golden thread
-- =====================================================================

CREATE TABLE ee.projects (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code         VARCHAR(20) UNIQUE NOT NULL, -- ED/YY-YY/NNN
  family_id            UUID NOT NULL REFERENCES public.families(id),
  project_name         VARCHAR(200),
  site_address         TEXT NOT NULL,
  city                 VARCHAR(100),
  total_area_sqft      DECIMAL(10,2),
  project_type         VARCHAR(50),                 -- 'residential','commercial','hospitality'
  is_dubai             BOOLEAN DEFAULT FALSE,

  -- Team (named, not generic)
  crmtl_id             UUID REFERENCES public.users(id),
  pmc_id               UUID REFERENCES public.users(id),
  designer_id          UUID REFERENCES public.users(id),
  architect_id         UUID REFERENCES public.users(id),
  visualiser_id        UUID REFERENCES public.users(id),
  site_supervisor_id   UUID REFERENCES public.users(id),

  -- Phase and health
  current_phase        project_phase DEFAULT 'discovery',
  rag_status           rag_status DEFAULT 'green',
  rag_notes            TEXT,
  rag_updated_at       TIMESTAMPTZ,

  -- Financials
  design_fee_total     DECIMAL(12,2),
  pmc_fee_total        DECIMAL(12,2),
  project_value_est    DECIMAL(14,2),
  ar_outstanding       DECIMAL(12,2) DEFAULT 0,

  -- Dates
  first_instalment_date DATE,
  target_dor_date       DATE,
  actual_dor_date       DATE,

  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- ACTIVITY CHART (9 Phases + 14 Design Stages + 14 Site Trades)
-- =====================================================================

CREATE TABLE ee.activity_phases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id        UUID NOT NULL REFERENCES ee.projects(id) ON DELETE CASCADE,
  phase             project_phase NOT NULL,
  planned_start     DATE,
  planned_end       DATE,
  actual_start      DATE,
  actual_end        DATE,
  status            VARCHAR(20) DEFAULT 'not_started',
  completion_pct    INTEGER DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  -- VisionCAM gate: cannot mark complete without photo
  visioncam_req     BOOLEAN DEFAULT TRUE,
  visioncam_photo_id UUID,                          -- FK added after photos table
  notes             TEXT,
  updated_by        UUID REFERENCES public.users(id),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, phase)
);

-- Design Room: 14 stages
CREATE TABLE ee.design_stages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES ee.projects(id) ON DELETE CASCADE,
  stage_no      INTEGER NOT NULL CHECK (stage_no BETWEEN 1 AND 14),
  stage_name    VARCHAR(200) NOT NULL,
  drawing_level VARCHAR(20),                        -- CP, SLD, FI, TP, GFC, AB
  status        VARCHAR(20) DEFAULT 'not_started',
  planned_date  DATE,
  actual_date   DATE,
  approved_by   UUID REFERENCES public.users(id),
  approved_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, stage_no)
);

-- On-site: 14 trade categories
CREATE TABLE ee.site_trades (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES ee.projects(id) ON DELETE CASCADE,
  trade           VARCHAR(60) NOT NULL,             -- Civil,Waterproofing,Plumbing,HVAC,Fire,Electrical,MS,Carpentry,Stone,Kitchen,Paint,Wallpaper,Lighting,False Ceiling
  vendor_id       UUID,                             -- FK after proc.vendors created
  work_order_id   UUID,                             -- FK after proc.work_orders created
  status          VARCHAR(20) DEFAULT 'not_started',
  planned_start   DATE,
  planned_end     DATE,
  actual_start    DATE,
  actual_end      DATE,
  completion_pct  INTEGER DEFAULT 0,
  noc_required    BOOLEAN DEFAULT FALSE,
  noc_received    BOOLEAN DEFAULT FALSE,
  noc_date        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- WIO / PIO (Universal Work Initiation Protocol — ALL departments)
-- =====================================================================

CREATE TABLE ee.wio (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wio_number       VARCHAR(35) UNIQUE NOT NULL,     -- WIO/YY-YY/NNN/DEPT
  project_id       UUID NOT NULL REFERENCES ee.projects(id),
  department_code  VARCHAR(20) NOT NULL,            -- ARCH,3D,INTERIOR,FFE,DRAFTING,STAGING,SITE,FACTORY

  -- 15-day conversion clock
  initiated_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  target_pio_date  DATE NOT NULL,                   -- initiated_date + 15
  actual_pio_date  DATE,

  -- Computed clock (read-only, computed at query time for live accuracy)
  -- Use: SELECT *, (target_pio_date - CURRENT_DATE) AS days_remaining FROM ee.wio
  -- Portal frontend shows amber ≤5 days, red ≤2 days

  -- Checklist: ALL THREE must be TRUE before PIO can be released
  boq_approved     BOOLEAN DEFAULT FALSE,           -- Approved BOQ
  design_3d_approved BOOLEAN DEFAULT FALSE,         -- Approved 3D
  sld_approved     BOOLEAN DEFAULT FALSE,           -- Approved SLD / scope docs

  status           wio_status DEFAULT 'initiated',
  initiated_by     UUID REFERENCES public.users(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Computed view for the WIO clock dashboard
CREATE VIEW ee.wio_clock AS
SELECT
  w.*,
  p.project_code,
  p.project_name,
  f.primary_contact AS family_name,
  (w.boq_approved AND w.design_3d_approved AND w.sld_approved) AS checklist_complete,
  (w.target_pio_date - CURRENT_DATE)::INTEGER AS days_remaining,
  CASE
    WHEN (w.target_pio_date - CURRENT_DATE) <= 2  THEN 'red'
    WHEN (w.target_pio_date - CURRENT_DATE) <= 5  THEN 'amber'
    ELSE 'green'
  END AS clock_rag,
  CASE WHEN w.status NOT IN ('converted_to_pio','cancelled') AND w.target_pio_date < CURRENT_DATE
    THEN TRUE ELSE FALSE END AS is_overdue
FROM ee.wio w
JOIN ee.projects p ON p.id = w.project_id
JOIN public.families f ON f.id = p.family_id
WHERE w.status NOT IN ('converted_to_pio','cancelled');
-- Views default to owner privileges, which would silently bypass the L0-L3
-- RLS fencing on the tables beneath. security_invoker keeps fencing intact.
ALTER VIEW ee.wio_clock SET (security_invoker = TRUE);

CREATE TABLE ee.pio (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pio_number       VARCHAR(30) UNIQUE NOT NULL,     -- ED/YY-YY/NNN
  wio_id           UUID REFERENCES ee.wio(id),
  project_id       UUID NOT NULL REFERENCES ee.projects(id),

  -- Triangle of Agreement: ALL FOUR before release (Brief §29 — Manika Nanda checks)
  final_boq_signed      BOOLEAN DEFAULT FALSE,
  final_3d_signed       BOOLEAN DEFAULT FALSE,
  gfc_signed_by_client  BOOLEAN DEFAULT FALSE,
  bom_shared            BOOLEAN DEFAULT FALSE,

  -- 45-day factory clock
  initiated_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  target_complete  DATE,
  actual_complete  DATE,

  status           pio_status DEFAULT 'initiated',
  initiated_by     UUID REFERENCES public.users(id),
  approved_by      UUID REFERENCES public.users(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE VIEW ee.pio_factory_clock AS
SELECT
  p.*,
  pr.project_code,
  pr.project_name,
  (p.final_boq_signed AND p.final_3d_signed AND p.gfc_signed_by_client AND p.bom_shared) AS triangle_complete,
  (p.target_complete - CURRENT_DATE)::INTEGER AS days_remaining,
  CASE
    WHEN (p.target_complete - CURRENT_DATE) <= 5  THEN 'red'
    WHEN (p.target_complete - CURRENT_DATE) <= 10 THEN 'amber'
    ELSE 'green'
  END AS clock_rag
FROM ee.pio p
JOIN ee.projects pr ON pr.id = p.project_id
WHERE p.status NOT IN ('installed');
ALTER VIEW ee.pio_factory_clock SET (security_invoker = TRUE);

-- =====================================================================
-- VISIONCAM (The Billing Trigger — Most Valuable Feature)
-- =====================================================================

CREATE TABLE ee.visioncam_photos (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES ee.projects(id),
  phase_id             UUID REFERENCES ee.activity_phases(id),
  trade_id             UUID REFERENCES ee.site_trades(id),
  design_stage_no      INTEGER,

  -- The photograph
  s3_key               TEXT NOT NULL UNIQUE,
  s3_url               TEXT NOT NULL,
  thumbnail_url        TEXT,

  -- GFC overlay reference (shown on same screen before capture)
  gfc_drawing_ref      VARCHAR(100),

  -- GPS metadata
  gps_lat              DECIMAL(10,7),
  gps_lng              DECIMAL(10,7),
  gps_accuracy_m       DECIMAL(6,2),
  gps_available        BOOLEAN DEFAULT TRUE,

  -- Quality gate (Aamir Khan's spec)
  qc_status            VARCHAR(20) DEFAULT 'pending', -- pending,pass,fail,query
  qc_notes             TEXT,
  qc_reviewed_by       UUID REFERENCES public.users(id),
  qc_reviewed_at       TIMESTAMPTZ,

  -- Billing trigger
  billing_triggered    BOOLEAN DEFAULT FALSE,
  billing_milestone_id UUID,                          -- FK added after billing table

  -- Capture metadata
  captured_by          UUID NOT NULL REFERENCES public.users(id),
  captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at            TIMESTAMPTZ DEFAULT NOW(),
  was_offline_capture  BOOLEAN DEFAULT FALSE,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Deferred FK now added
ALTER TABLE ee.activity_phases
  ADD CONSTRAINT fk_visioncam_photo
  FOREIGN KEY (visioncam_photo_id) REFERENCES ee.visioncam_photos(id);

-- =====================================================================
-- BILLING MILESTONES (AR Management)
-- =====================================================================

CREATE TABLE ee.billing_milestones (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id       UUID NOT NULL REFERENCES ee.projects(id),
  milestone_name   VARCHAR(200) NOT NULL,
  sequence_no      INTEGER,
  amount           DECIMAL(12,2) NOT NULL,
  milestone_pct    DECIMAL(5,2),

  -- What triggers this milestone
  trigger_type     VARCHAR(50),                     -- 'visioncam','phase_complete','manual','date'
  trigger_ref      UUID,

  -- Invoice
  is_due           BOOLEAN DEFAULT FALSE,
  due_date         DATE,
  invoice_raised   BOOLEAN DEFAULT FALSE,
  invoice_date     DATE,
  invoice_number   VARCHAR(50),

  -- Payment
  amount_paid      DECIMAL(12,2) DEFAULT 0,
  payment_date     DATE,
  payment_ref      VARCHAR(100),
  -- NOTE: overdue depends on CURRENT_DATE, which Postgres forbids inside a
  -- stored generated column (generation expressions must be immutable).
  -- Overdue is computed live in the ee.billing_status view below.

  -- For contractor running bills (VisionCAM-triggered)
  is_running_bill  BOOLEAN DEFAULT FALSE,
  vendor_id        UUID,
  work_order_id    UUID,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Live overdue computation (replaces the illegal generated column)
CREATE VIEW ee.billing_status AS
SELECT
  b.*,
  (b.invoice_raised AND b.amount_paid < b.amount AND b.due_date < CURRENT_DATE) AS is_overdue
FROM ee.billing_milestones b;
ALTER VIEW ee.billing_status SET (security_invoker = TRUE);

-- =====================================================================
-- PROCUREMENT: VENDORS (VRN) · WORK ORDERS · POs · GRNs
-- =====================================================================

CREATE TABLE proc.vendors (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vrn_number       VARCHAR(30) UNIQUE NOT NULL,     -- VRN/YY-YY/NNN
  company_name     VARCHAR(200) NOT NULL,
  contact_person   VARCHAR(200),
  phone            VARCHAR(20),
  email            VARCHAR(255),
  address          TEXT,
  gst_number       VARCHAR(20),
  pan_number       VARCHAR(20),
  aadhaar_number   VARCHAR(20),
  bank_account     VARCHAR(30),
  bank_ifsc        VARCHAR(20),
  bank_name        VARCHAR(100),
  vendor_type      VARCHAR(50),                     -- 'contractor','supplier','specialist'
  trade_categories JSONB DEFAULT '[]',
  -- VRN lifecycle
  vrn_status       VARCHAR(20) DEFAULT 'active',    -- active,suspended,revoked
  vrn_issued_date  DATE,
  vrn_expiry_date  DATE,                            -- annual renewal
  vrn_revoked_at   TIMESTAMPTZ,
  revocation_reason TEXT,
  -- Performance
  performance_score DECIMAL(3,1) CHECK (performance_score BETWEEN 0 AND 10),
  is_preferred     BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE proc.work_orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wo_number        VARCHAR(30) UNIQUE NOT NULL,     -- AIPL/YY-YY/NNN or AD/YY-YY/NNN or EDPL/YY-YY/NNN
  legal_entity     VARCHAR(10) NOT NULL CHECK (legal_entity IN ('AIPL','ADREM','EDPL')),
  project_id       UUID REFERENCES ee.projects(id),
  vendor_id        UUID NOT NULL REFERENCES proc.vendors(id),
  pio_id           UUID REFERENCES ee.pio(id),
  trade_category   VARCHAR(100),
  work_description TEXT,

  -- Financials
  wo_value                DECIMAL(12,2) NOT NULL,
  -- 20% coordination charge for third-party scopes: auto-added, cannot be deleted
  coordination_charge_pct DECIMAL(5,2) DEFAULT 0 CHECK (coordination_charge_pct IN (0, 20)),
  coordination_charge_amt DECIMAL(12,2) GENERATED ALWAYS AS
    (ROUND(wo_value * coordination_charge_pct / 100, 2)) STORED,
  total_value             DECIMAL(12,2) GENERATED ALWAYS AS
    (wo_value + ROUND(wo_value * coordination_charge_pct / 100, 2)) STORED,

  -- Timeline
  order_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  planned_start    DATE,
  planned_complete DATE,
  actual_complete  DATE,

  -- Payment terms (standard per Brief §33)
  advance_pct      DECIMAL(5,2) DEFAULT 50,
  retention_pct    DECIMAL(5,2) DEFAULT 20,         -- 20% held until DoR

  -- Delay penalty (1%/week, cap 5% — auto-calculated)
  delay_weeks      INTEGER DEFAULT 0,
  delay_penalty_pct DECIMAL(5,2) GENERATED ALWAYS AS
    (LEAST(delay_weeks::DECIMAL * 1.0, 5.0)) STORED,
  delay_penalty_amt DECIMAL(12,2) GENERATED ALWAYS AS
    (ROUND(wo_value * LEAST(delay_weeks::DECIMAL * 1.0, 5.0) / 100, 2)) STORED,

  status           doc_status DEFAULT 'draft',
  approved_by      UUID REFERENCES public.users(id),
  approved_at      TIMESTAMPTZ,
  created_by       UUID REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE proc.wo_line_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wo_id        UUID NOT NULL REFERENCES proc.work_orders(id) ON DELETE CASCADE,
  serial_no    INTEGER NOT NULL,
  pio_ref      VARCHAR(30),                         -- links to PIO number
  description  TEXT NOT NULL,
  unit         VARCHAR(20),                         -- RFT,SFT,NOS,SQM etc.
  quantity     DECIMAL(10,3),
  rate         DECIMAL(10,2),
  amount       DECIMAL(12,2) GENERATED ALWAYS AS (ROUND(quantity * rate, 2)) STORED,
  remarks      TEXT,
  UNIQUE (wo_id, serial_no)
);

CREATE TABLE proc.purchase_orders (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number              VARCHAR(30) UNIQUE NOT NULL, -- ESS/PO/YYYY/####
  project_id             UUID REFERENCES ee.projects(id),
  vendor_id              UUID NOT NULL REFERENCES proc.vendors(id),
  -- Three-quotes rule (mandatory above ₹25,000)
  quote_1_vendor_id      UUID REFERENCES proc.vendors(id),
  quote_1_amount         DECIMAL(12,2),
  quote_2_vendor_id      UUID REFERENCES proc.vendors(id),
  quote_2_amount         DECIMAL(12,2),
  quote_3_vendor_id      UUID REFERENCES proc.vendors(id),
  quote_3_amount         DECIMAL(12,2),
  three_quotes_satisfied BOOLEAN DEFAULT FALSE,
  three_quotes_waived    BOOLEAN DEFAULT FALSE,      -- requires written approval
  waiver_approved_by     UUID REFERENCES public.users(id),
  waiver_reason          TEXT,
  total_amount           DECIMAL(12,2) NOT NULL,
  expected_delivery      DATE,
  actual_delivery        DATE,
  status                 doc_status DEFAULT 'draft',
  approved_by            UUID REFERENCES public.users(id),
  created_by             UUID REFERENCES public.users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE proc.goods_received_notes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grn_number       VARCHAR(30) UNIQUE NOT NULL,     -- auto-generated
  po_id            UUID REFERENCES proc.purchase_orders(id),
  vendor_id        UUID NOT NULL REFERENCES proc.vendors(id),
  received_by      UUID REFERENCES public.users(id),
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qc_pass          BOOLEAN,
  qc_notes         TEXT,
  discrepancy      BOOLEAN DEFAULT FALSE,
  discrepancy_notes TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Order Confirmation (OC/YY-YY/NNN)
CREATE TABLE ee.order_confirmations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oc_number    VARCHAR(30) UNIQUE NOT NULL,
  project_id   UUID NOT NULL REFERENCES ee.projects(id),
  family_id    UUID NOT NULL REFERENCES public.families(id),
  scope        TEXT,
  confirmed_by UUID REFERENCES public.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Replacement Initiation Order (RIO/YY-YY/NNN)
CREATE TABLE ee.replacement_orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rio_number       VARCHAR(30) UNIQUE NOT NULL,
  project_id       UUID NOT NULL REFERENCES ee.projects(id),
  original_pio_id  UUID REFERENCES ee.pio(id),
  reason           TEXT NOT NULL,
  cost_to_essentia DECIMAL(12,2),
  cost_to_client   DECIMAL(12,2),
  approved_by      UUID REFERENCES public.users(id),
  status           doc_status DEFAULT 'draft',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- FACTORY (NH8 Manufacturing — 9 departments, 145 craftspeople)
-- =====================================================================

CREATE TABLE factory.departments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL,               -- Carpentry,Metal Fabrication,Stone & CNC,Upholstery,Polish,Packing,Fittings,Pottery,PPC
  hod_id       UUID REFERENCES public.users(id),
  team_size    INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE factory.pio_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pio_id          UUID NOT NULL REFERENCES ee.pio(id),
  dept_id         UUID NOT NULL REFERENCES factory.departments(id),
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  initiated_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  target_complete DATE NOT NULL,
  actual_complete DATE,
  status          VARCHAR(30) DEFAULT 'queued',
  notes           TEXT
);

-- 14-day capacity forecast per HOD (the proactive signal)
CREATE TABLE factory.capacity_forecast (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dept_id          UUID NOT NULL REFERENCES factory.departments(id),
  forecast_date    DATE NOT NULL,
  pios_arriving    INTEGER DEFAULT 0,
  manpower_avail   INTEGER,
  capacity_flag    rag_status DEFAULT 'green',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dept_id, forecast_date)
);

-- =====================================================================
-- EH (essentia home — 3 Experience Centres)
-- =====================================================================

CREATE TABLE eh.experience_centres (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           ec_code UNIQUE NOT NULL,
  name           VARCHAR(200) NOT NULL,
  city           VARCHAR(100),
  country_head_id UUID REFERENCES public.users(id),
  target_monthly DECIMAL(12,2),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE eh.sales (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ec_id            UUID NOT NULL REFERENCES eh.experience_centres(id),
  sale_date        DATE NOT NULL,
  invoice_number   VARCHAR(100),
  family_id        UUID REFERENCES public.families(id),
  ca_id            UUID REFERENCES public.users(id),  -- Client Advisor
  zakya_ref        VARCHAR(100),                       -- Zakya POS reference
  gross_amount     DECIMAL(12,2),
  -- Discount control gate (EH Brief §28 — must be approved before communication)
  discount_pct     DECIMAL(5,2) DEFAULT 0,
  discount_approved_by  UUID REFERENCES public.users(id),
  discount_approved_at  TIMESTAMPTZ,
  discount_communicated_before_approval BOOLEAN DEFAULT FALSE, -- must remain FALSE
  net_amount       DECIMAL(12,2),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE eh.daily_checklist (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ec_id        UUID NOT NULL REFERENCES eh.experience_centres(id),
  check_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by UUID REFERENCES public.users(id),
  all_complete BOOLEAN DEFAULT FALSE,
  items        JSONB DEFAULT '[]',                   -- [{item,complete,notes}]
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ec_id, check_date)
);

-- =====================================================================
-- PORTAL INTELLIGENCE LAYER
-- =====================================================================

-- 3-tier Notification System
CREATE TABLE portal.notifications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id     UUID NOT NULL REFERENCES public.users(id),
  tier             notif_tier NOT NULL,
  title            VARCHAR(300) NOT NULL,
  body             TEXT,
  action_url       TEXT,
  action_label     VARCHAR(100),
  -- Delivery channels
  delivered_app    BOOLEAN DEFAULT FALSE,
  delivered_wa     BOOLEAN DEFAULT FALSE,            -- WhatsApp
  delivered_email  BOOLEAN DEFAULT FALSE,
  -- Status
  read_at          TIMESTAMPTZ,
  actioned_at      TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  -- Source (what triggered this notification)
  source_type      VARCHAR(100),                     -- 'wio_clock','pio_overdue','ar_alert' etc.
  source_id        UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 40 Auto-Pilot Events log
CREATE TABLE portal.autopilot_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type   VARCHAR(100) NOT NULL,
  fired_at     TIMESTAMPTZ DEFAULT NOW(),
  project_id   UUID REFERENCES ee.projects(id),
  user_id      UUID REFERENCES public.users(id),
  payload      JSONB,
  success      BOOLEAN DEFAULT TRUE,
  error_msg    TEXT
);

-- Communication Spine (18 letter types — Anthropic API generates draft)
CREATE TABLE portal.communication_spine (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES ee.projects(id),
  family_id       UUID NOT NULL REFERENCES public.families(id),
  letter_type     letter_type NOT NULL,
  trigger_event   VARCHAR(100),
  -- AI draft
  ai_draft        TEXT,                              -- Anthropic API output
  ai_model        VARCHAR(50) DEFAULT 'claude-sonnet-4-6',
  ai_generated_at TIMESTAMPTZ,
  -- TL review gate (must scroll to bottom before send)
  reviewed_by     UUID REFERENCES public.users(id),
  reviewed_at     TIMESTAMPTZ,
  scroll_complete BOOLEAN DEFAULT FALSE,             -- the mandatory read gate
  final_content   TEXT,
  -- Send
  channel         VARCHAR(20) DEFAULT 'whatsapp',
  sent_at         TIMESTAMPTZ,
  wa_message_id   VARCHAR(200),
  scheduled_for   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Library (Wednesday Year artefacts — semantic search via pgvector)
CREATE TABLE portal.knowledge_library (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(300) NOT NULL,
  content       TEXT NOT NULL,
  content_type  VARCHAR(50),                        -- 'craft_wednesday','strategic_wednesday','case_study','sop'
  track         VARCHAR(100),                       -- six Wednesday Year tracks
  -- Five-dimensional search (Brief §32)
  role_tags          JSONB DEFAULT '[]',
  topic_tags         JSONB DEFAULT '[]',
  project_type_tags  JSONB DEFAULT '[]',
  year_tag           INTEGER,
  senior_lead_id     UUID REFERENCES public.users(id),
  -- Semantic embedding (Anthropic → pgvector)
  embedding          vector(1536),
  session_date       DATE,
  created_by         UUID REFERENCES public.users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_kl_vec ON portal.knowledge_library
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Founder Morning Brief (auto-generated at 6:30am — the 7 numbers)
CREATE TABLE portal.founder_brief (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_date         DATE NOT NULL UNIQUE,
  generated_at       TIMESTAMPTZ DEFAULT NOW(),
  -- The 7 numbers (Brief §37)
  projects_rag       JSONB,                         -- {green:N, amber:N, red:N}
  eh_mtd_revenue     DECIMAL(12,2),
  eh_mtd_target      DECIMAL(12,2),
  nh8_health_score   DECIMAL(4,1),
  ar_over_45_days    DECIMAL(14,2),
  wios_at_risk       INTEGER,
  open_escalations   INTEGER,
  people_alerts      INTEGER,
  -- Integration health snapshot
  api_health         JSONB,                         -- {tranzact:'green', keka:'green', ...}
  -- Did Hardesh read it?
  read_at            TIMESTAMPTZ,
  read_duration_secs INTEGER
);

-- =====================================================================
-- API HEALTH MONITORING (11 integrations — pinged every 5 min)
-- =====================================================================

CREATE TABLE portal.api_health_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration  api_name NOT NULL,
  checked_at   TIMESTAMPTZ DEFAULT NOW(),
  status       VARCHAR(20) NOT NULL,               -- 'healthy','degraded','down'
  response_ms  INTEGER,
  error_msg    TEXT,
  alert_sent   BOOLEAN DEFAULT FALSE
);
-- Retain 30 days of health logs, purge older
CREATE INDEX idx_api_health ON portal.api_health_log(integration, checked_at DESC);

CREATE TABLE portal.api_failure_state (
  integration          api_name PRIMARY KEY,
  consecutive_failures INTEGER DEFAULT 0,
  first_failure_at     TIMESTAMPTZ,
  last_checked_at      TIMESTAMPTZ DEFAULT NOW(),
  alert_sent_to        UUID REFERENCES public.users(id),
  is_degraded          BOOLEAN DEFAULT FALSE,
  resolved_at          TIMESTAMPTZ
);

-- =====================================================================
-- AUDIT LOG (Immutable — partitioned by month for performance)
-- =====================================================================

CREATE TABLE audit.log (
  id            UUID DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES public.users(id),
  action        VARCHAR(100) NOT NULL,              -- CREATE,UPDATE,DELETE,APPROVE,LOGIN,EXIT_PROTOCOL
  resource_type VARCHAR(100) NOT NULL,
  resource_id   UUID,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE audit.log_2026_06 PARTITION OF audit.log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit.log_2026_07 PARTITION OF audit.log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit.log_2026_08 PARTITION OF audit.log
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- =====================================================================
-- PERFORMANCE INDEXES
-- =====================================================================

CREATE INDEX idx_users_dept       ON public.users(department_id);
CREATE INDEX idx_users_active     ON public.users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_exit       ON public.users(exit_date) WHERE exit_date IS NOT NULL;

CREATE INDEX idx_proj_code        ON ee.projects(project_code);
CREATE INDEX idx_proj_family      ON ee.projects(family_id);
CREATE INDEX idx_proj_phase       ON ee.projects(current_phase);
CREATE INDEX idx_proj_rag         ON ee.projects(rag_status) WHERE is_active = TRUE;
CREATE INDEX idx_proj_pmc         ON ee.projects(pmc_id)     WHERE is_active = TRUE;
CREATE INDEX idx_proj_crmtl       ON ee.projects(crmtl_id)   WHERE is_active = TRUE;

CREATE INDEX idx_wio_project      ON ee.wio(project_id);
CREATE INDEX idx_wio_status       ON ee.wio(status);
CREATE INDEX idx_wio_clock        ON ee.wio(target_pio_date)
  WHERE status NOT IN ('converted_to_pio','cancelled');

CREATE INDEX idx_pio_project      ON ee.pio(project_id);
CREATE INDEX idx_pio_wio          ON ee.pio(wio_id);

CREATE INDEX idx_photos_project   ON ee.visioncam_photos(project_id);
CREATE INDEX idx_photos_phase     ON ee.visioncam_photos(phase_id);
CREATE INDEX idx_photos_billing   ON ee.visioncam_photos(billing_triggered)
  WHERE billing_triggered = FALSE;

CREATE INDEX idx_billing_project  ON ee.billing_milestones(project_id);
CREATE INDEX idx_billing_unpaid   ON ee.billing_milestones(due_date)
  WHERE invoice_raised AND amount_paid < amount;

CREATE INDEX idx_vendors_vrn      ON proc.vendors(vrn_number);
CREATE INDEX idx_vendors_active   ON proc.vendors(vrn_status) WHERE vrn_status = 'active';
CREATE INDEX idx_wo_project       ON proc.work_orders(project_id);
CREATE INDEX idx_wo_vendor        ON proc.work_orders(vendor_id);

CREATE INDEX idx_notif_recipient  ON portal.notifications(recipient_id);
CREATE INDEX idx_notif_unread     ON portal.notifications(recipient_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX idx_audit_resource   ON audit.log(resource_type, resource_id);
CREATE INDEX idx_audit_user       ON audit.log(user_id, created_at DESC);

-- =====================================================================
-- DOCUMENT NUMBER SEQUENCE GENERATORS
-- =====================================================================
-- Usage: SELECT next_project_code() → 'ED/26-27/001'
-- These fire automatically when a new record is created

CREATE SEQUENCE seq_project    START 1;
CREATE SEQUENCE seq_wio        START 1;
CREATE SEQUENCE seq_pio        START 1;
CREATE SEQUENCE seq_wo_aipl    START 1;
CREATE SEQUENCE seq_wo_adrem   START 1;
CREATE SEQUENCE seq_wo_edpl    START 1;
CREATE SEQUENCE seq_po         START 1;
CREATE SEQUENCE seq_grn        START 1;
CREATE SEQUENCE seq_vrn        START 1;
CREATE SEQUENCE seq_oc         START 1;
CREATE SEQUENCE seq_rio        START 1;

CREATE OR REPLACE FUNCTION fy_suffix() RETURNS TEXT AS $$
  SELECT TO_CHAR(CURRENT_DATE,'YY') || '-' ||
         TO_CHAR(CURRENT_DATE + INTERVAL '1 year','YY');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION next_project_code() RETURNS TEXT AS $$
  SELECT 'ED/' || fy_suffix() || '/' || LPAD(nextval('seq_project')::TEXT, 3,'0');
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_wio_number(dept_code TEXT) RETURNS TEXT AS $$
  SELECT 'WIO/' || fy_suffix() || '/' || LPAD(nextval('seq_wio')::TEXT,3,'0') || '/' || dept_code;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_pio_number() RETURNS TEXT AS $$
  SELECT 'ED/' || fy_suffix() || '/' || LPAD(nextval('seq_pio')::TEXT,3,'0');
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_wo_number(entity TEXT) RETURNS TEXT AS $$
  SELECT CASE entity
    WHEN 'AIPL'  THEN 'AIPL/'  || fy_suffix() || '/' || LPAD(nextval('seq_wo_aipl')::TEXT,3,'0')
    WHEN 'ADREM' THEN 'AD/'    || fy_suffix() || '/' || LPAD(nextval('seq_wo_adrem')::TEXT,3,'0')
    WHEN 'EDPL'  THEN 'EDPL/'  || fy_suffix() || '/' || LPAD(nextval('seq_wo_edpl')::TEXT,3,'0')
    ELSE NULL END;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_po_number() RETURNS TEXT AS $$
  SELECT 'ESS/PO/' || TO_CHAR(CURRENT_DATE,'YYYY') || '/' || LPAD(nextval('seq_po')::TEXT,4,'0');
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION next_vrn_number() RETURNS TEXT AS $$
  SELECT 'VRN/' || fy_suffix() || '/' || LPAD(nextval('seq_vrn')::TEXT,3,'0');
$$ LANGUAGE SQL;

-- =====================================================================
-- ROW-LEVEL SECURITY (L0-L3 Fencing — enforced at database level)
-- =====================================================================

ALTER TABLE ee.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ee.billing_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE eh.sales           ENABLE ROW LEVEL SECURITY;

-- L0/L1: see everything
-- L2: see own department's projects only
-- L3: see only projects assigned to them
CREATE POLICY proj_access ON ee.projects
  USING (
    current_setting('app.user_access_level', TRUE)::access_level IN ('L0','L1')
    OR (
      current_setting('app.user_access_level', TRUE)::access_level = 'L2'
      AND (crmtl_id = current_setting('app.user_id', TRUE)::UUID
        OR pmc_id = current_setting('app.user_id', TRUE)::UUID
        OR designer_id = current_setting('app.user_id', TRUE)::UUID)
    )
    OR (
      current_setting('app.user_access_level', TRUE)::access_level = 'L3'
      AND (crmtl_id = current_setting('app.user_id', TRUE)::UUID
        OR pmc_id = current_setting('app.user_id', TRUE)::UUID
        OR site_supervisor_id = current_setting('app.user_id', TRUE)::UUID)
    )
  );

-- Explicit policies for the remaining RLS-enabled tables. RLS with no policy
-- means default-deny — the app role could never read these at all. L0/L1 see
-- everything per the fencing model; L2/L3 policies land with the auth module
-- once department-project mapping is wired.
CREATE POLICY families_l0l1 ON public.families
  USING (current_setting('app.user_access_level', TRUE) IN ('L0','L1'));
CREATE POLICY billing_l0l1 ON ee.billing_milestones
  USING (current_setting('app.user_access_level', TRUE) IN ('L0','L1'));
CREATE POLICY eh_sales_l0l1 ON eh.sales
  USING (current_setting('app.user_access_level', TRUE) IN ('L0','L1'));

-- L2/L3 read the family attached to a project they serve (fencing: you see
-- the whole person only for relationships you own). Without this, wio_clock's
-- families join returns zero rows for the CRM TL — the screen's own persona.
CREATE POLICY families_project_team ON public.families
  USING (
    EXISTS (
      SELECT 1 FROM ee.projects pr
      WHERE pr.family_id = families.id
        AND (
          pr.crmtl_id              = current_setting('app.user_id', TRUE)::UUID
          OR pr.pmc_id             = current_setting('app.user_id', TRUE)::UUID
          OR pr.designer_id        = current_setting('app.user_id', TRUE)::UUID
          OR pr.site_supervisor_id = current_setting('app.user_id', TRUE)::UUID
        )
    )
  );

-- =====================================================================
-- TRIGGER: auto-generate project_code on INSERT
-- =====================================================================

CREATE OR REPLACE FUNCTION trg_set_project_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_code IS NULL THEN
    NEW.project_code := next_project_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_project_code
  BEFORE INSERT ON ee.projects
  FOR EACH ROW EXECUTE FUNCTION trg_set_project_code();

-- =====================================================================
-- SCHEMA COMPLETE
-- 28 tables · 7 schemas · 11 enums · 25 indexes · RLS on 4 tables
-- Sequence generators for all 9 document number formats
-- pgvector for Knowledge Library semantic search
-- =====================================================================
-- NEXT: Run 002_seed_departments.sql to populate the 22 departments
-- NEXT: Run 003_seed_roles.sql to populate the L0-L3 permission matrix
-- =====================================================================
