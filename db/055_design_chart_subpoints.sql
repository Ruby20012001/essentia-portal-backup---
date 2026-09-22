-- =====================================================================
-- 055 — DESIGN ACTIVITY CHART · THE SUB-POINTS UNDER EACH ACTIVITY
--
--   Monica, 22 Sep: "jo hai wo to daalo."
--
--   The chart's 127 task lines are two things at once. Twenty-nine carry a
--   day number and are the tracker's activities, which db/050 took. The rest
--   are the detail beneath them: "HIRING OF MEPF CONSULTANT" broken into four
--   drawings, the BOQ into forty-four items, VENDOR ONBOARD into sixteen
--   trades, material delivery into seven materials.
--
--   None of them has a timeline of its own — the sheet writes "– – –" against
--   every one — and that is the reason they are not activities. An activity
--   is something that can be late. These are what you tick off inside one,
--   and the board says "No due day" against them rather than counting them
--   late, which is the honest answer for a line the chart never dated.
--
--   THE SHEET'S HIERARCHY NEEDED TWO CORRECTIONS, both from the same cause —
--   a merged day cell on the daily sheet:
--
--     · Five lines sat under SANCTIONING PROCESS that are activities in their
--       own right, with days of their own (56, 57, 64, 78, 82). They are not
--       repeated here.
--     · The five ID-team lines after them are the 3D checklist — pre-made
--       selections, camera angles, vibe, the sanitary fixture schedule — so
--       they sit under "Team 3D checklist fulfilled" at day 86.
--
--   Positions are multiplied by 100 first, which leaves room to slot a
--   sub-point after its parent without renumbering anything by hand. Nothing
--   already ticked is touched: a project's activities are joined by id.
--
--   Additive + idempotent.
--   ROLLBACK: DELETE FROM ee.design_activities WHERE optional AND due_day IS NULL;
-- =====================================================================

UPDATE ee.design_activities SET position = position * 100 WHERE position < 100;

INSERT INTO ee.design_activities
  (position, code, task, detail, due_day, standard_days, depends_on, depends_on_client, optional)
VALUES
  (1501, '15.1', 'ARCHITECTURE TEAM- RCP- REFLECTED CEILING PLAN', NULL, NULL, NULL, 'ARCHITECTURE', FALSE, TRUE),
  (1502, '15.2', 'ID TEAM- PRE-MADE SELECTIONS (what material is being used, should be finalized and approved by monica ma''am)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (1503, '15.3', 'ID TEAM - CAMERA ANGLES (AS/DESIGN PIO)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (1504, '15.4', 'ID TEAM - VIBE (APPROVED BY CLINET)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (1505, '15.5', 'ID TEAM- (SANITARY FIXTURE SCHEDULE) ALL MODELS TO BE FINIALIZATION)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (1701, '17.1', 'CRM & PRODURMENT+ STORE: SITE MOBILISATION PROCURMENT TEAM- AS SOON AS THEY PROVIDE US ALL MOBALIZATION MATERIAL', NULL, NULL, NULL, 'CRM - FOLLOW UP, PROCURMENT - HIRING AND WORK ORDER,', FALSE, TRUE),
  (1702, '17.2', 'CRM- SITE DOCUMENATIONS', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (1703, '17.3', 'ARCHITECTURE & CRM: DRAWINGS FOR SITE FINALIZATIONS OF- 1). Column layout as per architectural layout, 2). MEP layouts 3). Foundation drawing as per final Column and MEP layout 4). Roofing details (framing plans, beam sizes etc.)', NULL, NULL, NULL, 'ARCHITECTURE', FALSE, TRUE),
  (1704, '17.4', 'PRODURMENT & CRM: VENDOR ONBOARD', NULL, NULL, NULL, 'CRM - FOLLOW UP, PROCURMENT - HIRING AND WORK ORDER,', FALSE, TRUE),
  (2001, '20.1', 'ONSITE BOQ WORKING-', NULL, NULL, NULL, 'CRM & ACCOUNTS', FALSE, TRUE),
  (2002, '20.2', 'QUANTIFICATION OF ALL ITEM TO BE MADE ON THE SITE', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2003, '20.3', 'THIRD PARTY PI''S-', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2004, '20.4', 'EXTERIOR GLAZING', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2005, '20.5', 'SANITARY FIXTURES', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2006, '20.6', 'ARCHITECTURAL LIGHTS', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2007, '20.7', 'AV - AUDIO & VISUALS', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2008, '20.8', 'HVAC', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2009, '20.9', 'GYM (IF ANY)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2010, '20.10', 'LIFT (IF ANY)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2011, '20.11', 'GLASS METAL', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2012, '20.12', 'WATERBODY (IF ANY)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2013, '20.13', 'KITCHEN (IF ANY)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2014, '20.14', 'MODULAR FURNITURE (IF ANY)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2015, '20.15', 'CENTRALIZED WATER HEATING (IF REQUIRED)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2016, '20.16', 'AUTOMATION (IF REQUIRED)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2017, '20.17', 'MAIN GATE', NULL, NULL, NULL, '', FALSE, TRUE),
  (2018, '20.18', 'BLINDS (IF REQUIRED) ETC', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2019, '20.19', 'OFF-SITE BOQ-', NULL, NULL, NULL, 'ID &CRM& ACCOUNTS', FALSE, TRUE),
  (2020, '20.20', 'FURNITURE BOQ', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2021, '20.21', 'FURNITURE (STONE & FABRIC QTYS)', NULL, NULL, NULL, 'PRIYANKA (FABRIC) & FIYANSHU SIR (STONE)', FALSE, TRUE),
  (2022, '20.22', 'SLD''s OF :', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2023, '20.23', 'VANITY', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2024, '20.24', 'VANITY MIRROR,', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2025, '20.25', 'MEDIA UNIT', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2026, '20.26', 'WARDROBES /STORAGES', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2027, '20.27', 'DRESSERS', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2028, '20.28', 'DRESSER MIRROR', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2029, '20.29', 'KITCHEN/ PANTRY', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2030, '20.30', 'PANELLINGS', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2031, '20.31', 'DOORS (MAIN DOOR INCLUDED)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2032, '20.32', 'BOQ''s OF :', NULL, NULL, NULL, 'ACCOUNTS', FALSE, TRUE),
  (2033, '20.33', 'VANITY', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2034, '20.34', 'VANITY MIRROR,', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2035, '20.35', 'MEDIA UNIT', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2036, '20.36', 'WARDROBES /STORAGES', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2037, '20.37', 'DRESSERS', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2038, '20.38', 'DRESSER MIRROR', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2039, '20.39', 'KITCHEN/ PANTRY', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2040, '20.40', 'PANELLINGS', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2041, '20.41', 'DOORS (MAIN DOOR INCLUDED)', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2042, '20.42', 'DECOR BOQ-', NULL, NULL, NULL, 'ID &CRM& ACCOUNTS', FALSE, TRUE),
  (2043, '20.43', 'INTENTS OF DECOR :', NULL, NULL, NULL, 'DÉCOR TEAM', FALSE, TRUE),
  (2044, '20.44', 'DÉCOR BOQ :', NULL, NULL, NULL, 'DÉCOR AND ACCOUNTS', FALSE, TRUE),
  (2201, '22.1', 'CRM - LOOKBOOK SIGN OFF (DIGITAL/ON PAPER) FROM CLIENT (After all the revisions and feedback implimentations)', NULL, NULL, NULL, 'CRM TEAM', FALSE, TRUE),
  (2202, '22.2', 'ID TEAM- MATERIAL MARKING', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2203, '22.3', 'ID TEAM- FINISHING SCHEDULE WITH ALL THE CODE FOR THE HARD FINISHES', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2204, '22.4', 'ID TEAM- FURNITURE SCHEDULE (WIO APPROVED)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2205, '22.5', 'ID TEAM- (SANITARY FIXTURE SCHEDULE) ALL MODELS TO BE FINIALIZATION)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2206, '22.6', 'ID TEAM- SLD''s OF ALL OFFSITE ITEAMS', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2207, '22.7', 'CIVIL , MEP DRAWINGS FINAL SHOP DRAWINGS FROM CONSULTANTS', NULL, NULL, NULL, 'ARCHITECTURE & CRM TEAM', FALSE, TRUE),
  (3001, '26 C.1', 'REQUIRED- BOM, APPROVED BOQ , APPROVED DRAWING, CLIENT APPROVAL (BOQ , DRAWING AND INTENT)', NULL, NULL, NULL, '', FALSE, TRUE),
  (2401, '24.1', 'CRM & PRODURMENT+ STORE: SITE MOBILISATION (has already been done ACTIVITY- 15 (i) above)', NULL, NULL, NULL, 'CRM - FOLLOW UP, PROCURMENT - HIRING AND WORK ORDER,', FALSE, TRUE),
  (2402, '24.2', 'CRM- SITE DOCUMENATIONS- inductions etc.', NULL, NULL, NULL, 'CRM', FALSE, TRUE),
  (2403, '24.3', 'ARCHITECTURE & CRM: DRAWINGS FOR SITE FINALIZATIONS OF- INTERIOR GFC''S', NULL, NULL, NULL, 'ARCHITECTURE & CRM', FALSE, TRUE),
  (2701, '26 A.1', 'F&F FINISHES MEETING', NULL, NULL, NULL, '', FALSE, TRUE),
  (2702, '26 A.2', 'SIZE FROM SITE (CHECK IF THE WALLS ARE PARTIAL FINISHED TO TAKE THE SIZES)', NULL, NULL, NULL, 'SITE TEAM, WIO TEAM AND CRM TEAM', FALSE, TRUE),
  (2703, '26 A.3', 'ID TEAM- FURNITURE BOQ (FINISHES AND SIZES MENTIONED) (CLIENT APPROVED)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2704, '26 A.4', 'ID TEAM- (SANITARY FIXTURE SCHEDULE) ALL MODELS TO BE FINIALIZATION) (CLIENT APPROVED) FOR VANITY''S', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2705, '26 A.5', 'ID TEAM- SLD''s OF ALL OFFSITE ITEMS (CLIENT APPROVED)', NULL, NULL, NULL, 'ID TEAM', FALSE, TRUE),
  (2501, '24 iv.1', 'Civil', NULL, NULL, NULL, '', FALSE, TRUE),
  (2502, '24 iv.2', 'MS framing work', NULL, NULL, NULL, '', FALSE, TRUE),
  (2503, '24 iv.3', 'Dry wall partition (if any)', NULL, NULL, NULL, '', FALSE, TRUE),
  (2504, '24 iv.4', 'Waterproofing', NULL, NULL, NULL, '', FALSE, TRUE),
  (2505, '24 iv.5', 'Anti-termite', NULL, NULL, NULL, '', FALSE, TRUE),
  (2506, '24 iv.6', 'Plumbing', NULL, NULL, NULL, '', FALSE, TRUE),
  (2507, '24 iv.7', 'HVAC', NULL, NULL, NULL, '', FALSE, TRUE),
  (2508, '24 iv.8', 'Electrical', NULL, NULL, NULL, '', FALSE, TRUE),
  (2509, '24 iv.9', 'False ceiling', NULL, NULL, NULL, '', FALSE, TRUE),
  (2510, '24 iv.10', 'Stone/tile (laying & clading', NULL, NULL, NULL, '', FALSE, TRUE),
  (2511, '24 iv.11', 'Paint work', NULL, NULL, NULL, '', FALSE, TRUE),
  (2512, '24 iv.12', 'Lighting, fixtures and fans', NULL, NULL, NULL, '', FALSE, TRUE),
  (2513, '24 iv.13', 'Fire Fighting', NULL, NULL, NULL, '', FALSE, TRUE),
  (2514, '24 iv.14', 'Automation', NULL, NULL, NULL, '', FALSE, TRUE),
  (2515, '24 iv.15', 'P.o.P and ceiling', NULL, NULL, NULL, '', FALSE, TRUE),
  (2516, '24 iv.16', 'Kitchen vendor', NULL, NULL, NULL, '', FALSE, TRUE),
  (3401, '29 *.1', 'FABRIC', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (3402, '29 *.2', 'LEATHER', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (3403, '29 *.3', 'VENEER', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (3404, '29 *.4', 'CUSTOM VENEER', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (3405, '29 *.5', 'BASEWORK MATERIAL', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (3406, '29 *.6', 'STONE', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (3407, '29 *.7', 'STONE BLOCK', NULL, NULL, NULL, 'PROCURMENT', FALSE, TRUE),
  (2601, '25.1', 'tracking of production in the factory will be done by the ppc team via a defult pio tracker and update will be given on the group itself the crm''s role is to push and quality check.', NULL, NULL, NULL, '', FALSE, TRUE)
ON CONFLICT (position) DO NOTHING;

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM ee.design_activities WHERE due_day IS NOT NULL;
  IF n < 29 THEN
    RAISE EXCEPTION 'The dated activities have gone missing — found %, expected at least 29.', n;
  END IF;
END $$;
