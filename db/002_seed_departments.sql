-- =====================================================================
-- 002 — DEPARTMENTS · FACTORY STATIONS · EXPERIENCE CENTRES
-- Provenance: every row is traceable to the Portal Brief (section cited).
-- ⚠ PENDING SIGN-OFF: the brief asserts "22 departments" but never
--   enumerates the list, and says "9 factory departments" while naming
--   only 7 stations. This file seeds what the brief supports; the
--   canonical list needs Ruby/Monica confirmation.
--   See docs/BRIEF_DISCREPANCIES.md.
-- Idempotent: ON CONFLICT / NOT EXISTS guards throughout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- public.departments — WIO-receiving delivery departments (Brief §30;
-- codes match ee.wio.department_code conventions in the schema)
-- ---------------------------------------------------------------------
INSERT INTO public.departments (code, name, vertical) VALUES
  ('ARCH',     'Architecture',                    'EE'),      -- §30: Yoginder "Yogi"
  ('3D',       '3D Visualisation',                'EE'),      -- §30: Hriday Gagan Singh
  ('INTERIOR', 'Interior Design',                 'EE'),      -- §30: Vishakha Singh Arora
  ('FFE',      'FF&E',                            'EE'),      -- §30: Roop Deep Kaur
  ('DRAFTING', 'WIO / GFC Drafting',              'EE'),      -- §30: Jyoti Yadav's team
  ('STAGING',  'Staging & Styling',               'EE'),      -- §30: Shivani Dasturia
  ('SITE',     'Site Team',                       'EE'),      -- §26/§30: Bashruddin
  ('FACTORY',  'Factory Production (NH8)',        'FACTORY')  -- §30: Khushpreet / Mabud Rahaman
ON CONFLICT (code) DO NOTHING;

-- Business / shared departments (Brief §26 state machine + named heads)
INSERT INTO public.departments (code, name, vertical) VALUES
  ('BD',        'BD & Sales',                     'EE'),      -- §26: Preeti Vashisht
  ('CRM_EE',    'CRM — essentia environments',    'EE'),      -- §26/§39: Dhruv Kelaya, Neeru Bajaj
  ('BOQ',       'BOQ',                            'EE'),      -- §26: Vaibhav Shukla
  ('INSTALL',   'Installation',                   'EE'),      -- §26: Ajaypal Singh
  ('PROC',      'Procurement',                    'SHARED'),  -- §26/§39: Ashish Kumar
  ('ACCOUNTS',  'Accounts',                       'SHARED'),  -- §26/§39: Rajesh Kumar
  ('HR',        'HR / People',                    'SHARED'),  -- §26/§32: Ila Tomar
  ('LEGAL',     'Legal',                          'SHARED'),  -- §26: Hitakshi Narang
  ('MARKETING', 'Marketing',                      'SHARED'),  -- §1/§32: Ravineet Singh Marwah
  ('PPC',       'PPC (Production Planning)',      'FACTORY'), -- §39: Shipra Sharma
  ('QC',        'Quality Control',                'FACTORY'), -- §10/§26: Aamir Khan
  ('STORE',     'Store',                          'FACTORY'), -- §10: Banshi Ram
  ('PACKING',   'Packing & Dispatch',             'FACTORY')  -- §10/§26: Rajesh Jakhar
ON CONFLICT (code) DO NOTHING;

-- essentia home (EH) — one department per Experience Centre (§1, §27)
INSERT INTO public.departments (code, name, vertical) VALUES
  ('EH_GGN', 'EH Experience Centre — Gurugram (Flagship)', 'EH'),  -- §27: Nishi
  ('EH_DEL', 'EH Experience Centre — Sultanpur, Delhi',    'EH'),  -- §27: Nikita Basera
  ('EH_MUM', 'EH Experience Centre — Lower Parel, Mumbai', 'EH')   -- §27: lead unnamed in brief
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- factory.departments — the production stations. Brief §10 names SEVEN
-- (Carpentry → Metal → Stone/CNC → Upholstery → Polish → Fittings →
-- Assembly); §26/§39 consistently say "7 station HODs" while §10/§12
-- banner text says "All 9 Depts". Seeding the 7 named; the other 2 (if
-- real) need naming by the factory. HOD user links attach when staff
-- are imported from Keka (§39 names: Hitesh=Carpentry, Fiyanshu=Stone,
-- Kundan=Polish; Rakesh/Pryanka/Rishabh/Ritesh unmapped in brief).
-- ---------------------------------------------------------------------
INSERT INTO factory.departments (name)
SELECT v.name
FROM (VALUES
  ('Carpentry'),
  ('Metal'),
  ('Stone & CNC'),
  ('Upholstery'),
  ('Polish'),
  ('Fittings'),
  ('Assembly')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM factory.departments d WHERE d.name = v.name
);

-- ---------------------------------------------------------------------
-- eh.experience_centres (§1: Gurugram flagship 15,000 sqft; §27 leads).
-- target_monthly left NULL — the brief states Year-1 incentive
-- activation thresholds (₹1.5Cr / ₹1.2Cr / ₹1.0Cr), not monthly targets.
-- ---------------------------------------------------------------------
INSERT INTO eh.experience_centres (code, name, city) VALUES
  ('gurugram_hq',        'essentia home — Gurugram Flagship', 'Gurugram'),
  ('sultanpur_delhi',    'essentia home — Sultanpur',         'New Delhi'),
  ('mumbai_lower_parel', 'essentia home — Lower Parel',       'Mumbai')
ON CONFLICT (code) DO NOTHING;
