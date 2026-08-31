-- =====================================================================
-- 031 — WIO → PIO TRACKER · SEED (the team's live board, not fixtures)
--
--   Every row below is the REAL working data carried over from Dipmallya's
--   Excel tracker — 37 WIOs, 24 open delays, the 10-stage chain and
--   28 delay reasons. Verbatim. Nothing here is placeholder, sample or
--   rounded, and re-running this file never overwrites the team's later
--   edits (ON CONFLICT DO NOTHING / NOT EXISTS throughout).
--
--   THE 'TODAY' STAMP — 2026-08-25. Derived, not guessed.
--   All 24 delay rows satisfy  days_lost = 2026-08-25 − started, with no
--   exceptions. That single shared date is exactly the manually stamped
--   'Today' the workbook's Setup sheet carried, and it is why the numbers
--   reconcile. Seeding it preserves the board as the team left it. The team
--   re-stamps it on the Setup screen; the app never derives it from the wall
--   clock (see the rationale on ee.tracker_settings.today_stamp in db/030).
--
--   WHAT THE SEED SAYS OUT LOUD: 33 of the 37 rows carry no WIO issue
--   date, so their 15-day clock has never started and they read 'Not tracked'
--   rather than a reassuring 'On track'. That is the finding the board exists
--   to surface (ADR-HS-01, honest state) — not a gap to paper over at seed time.
--
--   ROLLBACK: DELETE FROM ee.tracker_delays; DELETE FROM ee.tracker_wios;
--             DELETE FROM ee.tracker_stages; DELETE FROM ee.tracker_delay_reasons;
--             DELETE FROM ee.tracker_people; DELETE FROM ee.tracker_settings;
-- =====================================================================

-- ---------------------------------------------------------------------
-- Board settings. Exactly one row, id = 1.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_settings (id, team_name, window_days, at_risk_from, today_stamp)
VALUES (1, 'Dipmallya''s team', 15, 5, DATE '2026-08-25')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- The stage chain, in order. `position` is load-bearing: "what happens next
-- and who it goes to" is read straight off it. `done_by` counts DOWN the
-- chain (14 → 0) — a deadline offset from the PIO-due date, not a duration.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_stages (position, stage, waiting_on, done_by) VALUES
  (1, 'Archive pass', 'PD team', 14),
  (2, 'SLD · Design', 'Design team', 10),
  (3, 'SLD · Architecture', 'Architecture team', 10),
  (4, 'Finishes', 'Roopdeep + CRM', 9),
  (5, 'GFC', 'Design Room', 4),
  (6, 'FG code', 'Shruti + CRM', 3),
  (7, 'BOM', 'Parul', 3),
  (8, 'Sign-off', 'Khushpreet + Yogi', 2),
  (9, 'Client sign-off', 'Client', 2),
  (10, 'PIO', 'WIO raised by', 0)
ON CONFLICT (stage) DO NOTHING;

-- ---------------------------------------------------------------------
-- Delay reasons. `cause` and `source` ride on the reason, so choosing a
-- reason fills both and the log cannot drift.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_delay_reasons (reason, cause, source, sort_order) VALUES
  ('Client · Drawing change', 'Client', 'Client', 1),
  ('Client · Selection delay', 'Client', 'Client', 2),
  ('Client · Approval delay', 'Client', 'Client', 3),
  ('Client · Scope change', 'Client', 'Client', 4),
  ('Client · Repeated revisions', 'Client', 'Client', 5),
  ('Client · Information pending', 'Client', 'Client', 6),
  ('Payment · Advance pending', 'Payment', 'Client', 7),
  ('Payment · Signature pending', 'Payment', 'Client', 8),
  ('CRM · PIO not raised', 'CRM', 'Internal', 9),
  ('CRM · Appointment not booked', 'CRM', 'Internal', 10),
  ('CRM · Input not given', 'CRM', 'Internal', 11),
  ('Drawing · Not started', 'Drawing', 'Internal', 12),
  ('Drawing · Revision', 'Drawing', 'Internal', 13),
  ('Drawing · Correction', 'Drawing', 'Internal', 14),
  ('Drawing · Waiting on coordination', 'Drawing', 'Internal', 15),
  ('Sign-off · Not returned', 'Sign-off', 'Internal', 16),
  ('Sign-off · Returned with changes', 'Sign-off', 'Internal', 17),
  ('Finishes · Not finalised', 'Finishes', 'Client', 18),
  ('Finishes · Schedule not issued', 'Finishes', 'Internal', 19),
  ('Finishes · Tier not stamped', 'Finishes', 'Internal', 20),
  ('BOM · In process too long', 'BOM', 'Internal', 21),
  ('FG code · Not issued', 'FG code', 'Internal', 22),
  ('Site · Not ready', 'Site', 'Client', 23),
  ('Site · Sizes not given', 'Site', 'Internal', 24),
  ('Vendor · Drawing not received', 'Vendor', 'Vendor', 25),
  ('Vendor · Quote pending', 'Vendor', 'Vendor', 26),
  ('Management · Decision pending', 'Management', 'Internal', 27),
  ('Other · Other — see remark', 'Other', 'Internal', 28)
ON CONFLICT (reason) DO NOTHING;

-- ---------------------------------------------------------------------
-- Names offered on "raised by" / "owner". Deliberately not FK'd to
-- public.users — the board names clients and vendors with no portal account.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_people (name, sort_order) VALUES
  ('Client', 1),
  ('Vendor', 2),
  ('PD team', 3),
  ('Design Room', 4),
  ('Shruti', 5),
  ('Roopdeep', 6),
  ('Parul', 7),
  ('Vaibhav', 8),
  ('Khushpreet', 9),
  ('Yoginder Singh', 10),
  ('Jyoti', 11),
  ('Vishakha Arora', 12),
  ('Dipmallya', 13),
  ('Nimisha', 14),
  ('Rohit', 15),
  ('Aparna', 16),
  ('Bhavya', 17),
  ('Dhruv Keayla', 18),
  ('Ishaan Sachar', 19),
  ('Ruby Nesrwal', 20),
  ('Shipra', 21),
  ('Khushi', 22),
  ('Nisha', 23),
  ('Monica', 24),
  ('Hardesh', 25),
  ('Sahil Mehta', 26),
  ('Tanisha', 27),
  ('Tanvi', 28),
  ('Riya', 29),
  ('Ishika Tibrewal', 30),
  ('Ar Ali Azmi', 31)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- The 37 tracked WIOs. stage_id resolves by stage NAME so this file stays
-- readable and re-runnable; the FK then guarantees no row can point at a
-- stage that is not in the chain.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_wios
  (wio_number, project, scope, raised_by, wio_issued, stage_id, since, notes, pio_released, pio_no)
SELECT v.wio_number, v.project, v.scope, v.raised_by, v.wio_issued, s.id,
       v.since, v.notes, v.pio_released, v.pio_no
FROM (VALUES
  ('ED/26-27/129', NULL, 'Stone door handle · 8 set', NULL, DATE '2026-08-24', 'Archive pass', DATE '2026-08-24', 'Classify against existing drawings', NULL::date, NULL),
  ('ED/26-27/130', NULL, 'Bag storage 1 no + Island 1 no', NULL, DATE '2026-08-24', 'Archive pass', DATE '2026-08-24', 'Classify against existing drawings', NULL::date, NULL),
  ('ED/26-27/086', 'Sherly Residence, Chennai', '6 of 6 drawings final', 'Nimisha', NULL::date, 'PIO', DATE '2026-08-13', 'Raise the PIO — sign-off done, client clear since 13 Aug', NULL::date, NULL),
  ('ED/26-27/089', 'Residence at Chennai', 'Wardrobes 2 nos', 'Nimisha', NULL::date, 'Sign-off', DATE '2026-08-24', 'Khushpreet and Yogi sir to sign the wardrobe drawings', NULL::date, NULL),
  ('ED/26-27/090', 'Anchor · Sumati Kanodia', '1 drawing correction', 'Nimisha', NULL::date, 'Sign-off', DATE '2026-08-24', 'Corrected drawing to CRM today; sign-off tomorrow', NULL::date, NULL),
  ('ED/26-27/046', 'Punjabi Bagh', '6 categories drawn, site not ready', 'Nimisha', NULL::date, 'PIO', DATE '2026-08-24', 'Site readiness — six categories drawn and waiting', NULL::date, NULL),
  ('ED/26-27/118', 'Preeta Goyal Residence', 'Stilt and 4th floor · 4 items', 'Rohit', NULL::date, 'Sign-off', DATE '2026-08-21', 'Drawings done 20–21 Aug — confirm where it actually sits', NULL::date, NULL),
  ('ED/26-27/121', 'Enayat House, Vasant Vihar', 'Furniture, glass doors, wooden doors', 'Nimisha', NULL::date, 'SLD · Design', DATE '2026-08-24', 'Nothing started on any of the three categories', NULL::date, NULL),
  ('ED/26-27/111', 'Preeta Goyal Residence', 'Mandir 1 no', 'Rohit', NULL::date, 'PIO', DATE '2026-08-24', 'Raise the PIO — BOM done, sign-off done, client clear', NULL::date, NULL),
  ('ED/26-27/097', 'Preeta Goyal Residence', 'Vanity with mirror, 4th floor', 'Rohit', NULL::date, 'PIO', DATE '2026-08-24', 'Raise the PIO — drawing done today', NULL::date, NULL),
  ('ED/26-27/092', 'Residence at Mumbai', '4 of 4 drawings shared', 'Aparna', NULL::date, 'PIO', DATE '2026-08-24', 'Client sends changes tomorrow; PIO pending from CRM', NULL::date, NULL),
  ('ED/26-27/106', 'Sonali Mittal', 'Dining table 1 no', 'Bhavya', NULL::date, 'Client sign-off', DATE '2026-08-24', 'Close the finish discussion, then raise the PIO', NULL::date, NULL),
  ('ED/26-27/084', 'Maharani Bagh', '11 of 35 issued, 17 finishes open', 'Bhavya', NULL::date, 'Finishes', DATE '2026-08-24', '11 drawings for sign-off tomorrow; chase 17 finishes', NULL::date, NULL),
  ('ED/26-27/083', 'Ladhani Residence', '6 categories', 'Bhavya', NULL::date, 'SLD · Design', DATE '2026-08-24', 'All categories clear from our side by Friday', NULL::date, NULL),
  ('ED/26-27/015', '632', '9 furniture, 4 signed off, 2 cancelled', 'Bhavya', NULL::date, 'Sign-off', DATE '2026-08-24', 'Appliances pending from CRM; media unit under discussion', NULL::date, NULL),
  ('ED/25-26/172', 'M3M', 'Loose furniture 65 · media unit · wardrobe · vanity and mirror', 'Tanisha', NULL::date, 'BOM', DATE '2026-08-24', 'BOM in process with Parul, then Tanisha raises the PIO. Last year''s WIO — still open.', NULL::date, NULL),
  ('ED/25-26/173', 'M3M Trump Tower', 'Sculptures 2 · decorative mirrors 5', 'Tanisha', NULL::date, 'PIO', DATE '2026-08-24', 'Raise the PIO — BOM done, sign-off done, client clear. Last year''s WIO.', NULL::date, NULL),
  ('ED/26-27/088', 'Nalin Gupta Residence', '6 furniture · 4 drawings done, 2 with the client', 'Sahil Mehta', NULL::date, 'Client sign-off', DATE '2026-08-24', '2 furniture with the client since 22 Aug', NULL::date, NULL),
  ('ED/26-27/098', '115 (A) Aralias', 'Media unit + storage, master bedroom', NULL, NULL::date, 'Sign-off', DATE '2026-08-24', 'Drawings done. Sign-off held by the offsite work revision. No TL named.', NULL::date, NULL),
  ('ED/26-27/109', 'Mehta Residence, DLF Phase 1', 'Loose furniture 9 nos', 'Ruby Nesrwal', DATE '2026-07-27', 'Client sign-off', DATE '2026-08-21', 'client sign off left', NULL::date, NULL),
  ('ED/26-27/120', 'Mehta Residence, DLF Phase 1', 'Coffee table 1 no', 'Ruby Nesrwal', DATE '2026-07-27', 'Client sign-off', DATE '2026-08-21', 'client sign off left', NULL::date, NULL),
  ('ED/26-27/081', 'Elite Dubai', 'Loose furniture 8 · panelling with metal · storage', 'Ishika Tibrewal', NULL::date, 'SLD · Design', DATE '2026-08-24', 'Storage SLD not provided by CRM. Panelling going for sign-off.', NULL::date, NULL),
  ('ED/26-27/099', 'Varun Puri', '2 furniture, sign-off done', 'Tanvi', NULL::date, 'PIO', DATE '2026-08-24', 'Raise the PIO. Report also says going for client discussion — confirm which.', NULL::date, NULL),
  ('ED/26-27/018', 'Panchsheel Park Residence', '7 wardrobes · 7 vanities · 7 mirrors · N44 furniture 84', 'Ar Ali Azmi', NULL::date, 'Client sign-off', DATE '2026-08-24', 'Wardrobes with the client after revision. Reported twice with different scopes — confirm.', NULL::date, NULL),
  ('ED/26-27/122', 'Raghav Karol', 'Console 1 · door handles 3', 'Riya', NULL::date, 'PIO', DATE '2026-08-24', 'Raise the PIO. 1 door handle on hold by CRM.', NULL::date, NULL),
  ('ED/26-27/057', 'Nalin Gupta Residence', '40 furniture · 10 to PIO, 11 to BOM, 9 cancelled', 'Sahil Mehta', NULL::date, 'Finishes', DATE '2026-08-24', '6 furniture finishes pending from CRM. 2 design changes with the client.', NULL::date, NULL),
  ('ED/26-27/053', '1912 (A) Magnolias', 'Open storage for study area 1 no', 'Sahil Mehta', NULL::date, 'Finishes', DATE '2026-08-24', 'Metal sample made, not approved', NULL::date, NULL),
  ('ED/26-27/119', 'Panchsheel Park Residence', 'Pooja door · fixed glass · barisol · outdoor furniture 8 · sculptures 30', 'Ar Ali Azmi', NULL::date, 'SLD · Design', DATE '2026-08-24', 'All five in process. Drawings promised by 26 Aug.', NULL::date, NULL),
  ('ED/26-27/091', '115 (A) Aralias', 'Bar counter · bar back storage', 'Sahil Mehta', NULL::date, 'SLD · Design', DATE '2026-08-24', 'Bar counter promised 24 Aug, back storage 27 Aug', NULL::date, NULL),
  ('ED/26-27/127', 'Nagpal Residence', 'Main door with panelling · main door handle', 'Ar Ali Azmi', NULL::date, 'SLD · Architecture', DATE '2026-08-24', 'Both in process. Drawings promised by 27 Aug.', NULL::date, NULL),
  ('ED/26-27/128', 'Nalin Gupta Residence', 'Dining chairs 8 · beds · night stands', 'Sahil Mehta', NULL::date, 'SLD · Design', DATE '2026-08-24', '1 bed on hold. 2 furniture signed off, going for client discussion.', NULL::date, NULL),
  ('ED/26-27/100', 'Nalin Gupta Residence', 'Night stand, mother''s bedroom 2 nos', 'Sahil Mehta', NULL::date, 'SLD · Design', DATE '2026-08-24', 'Drawing on hold from the client side', NULL::date, NULL),
  ('ED/26-27/039', '115 (A) Aralias', 'Loose furniture 41 nos — all drawings done', 'Sahil Mehta', NULL::date, 'Sign-off', DATE '2026-08-24', 'All 41 done, last revision completed today', NULL::date, NULL),
  ('— no WIO number —', 'Design Democracy', 'Wardrobe', NULL, NULL::date, 'Sign-off', DATE '2026-08-24', 'Cannot be tracked until a WIO number is issued', NULL::date, NULL),
  ('ED/26-27/136', 'Ridhima Jain Residence', 'Door handle 2 nos', 'Sahil Mehta', NULL::date, 'SLD · Architecture', DATE '2026-08-24', 'CRM to provide the door drawing. BOM and sign-off both pending.', NULL::date, NULL),
  ('ED/26-27/137', '1912 (A) Magnolias', 'Shoe storage 1 · credenza 1', 'Sahil Mehta', NULL::date, 'SLD · Design', DATE '2026-08-24', 'Drawings promised 31 Aug', NULL::date, NULL),
  ('ED/26-27/133', 'Singhal Residence', 'Loose furniture 20 nos', 'Sahil Mehta', NULL::date, 'SLD · Design', DATE '2026-08-24', 'Promised date reads 02/08/26 — three weeks past. Confirm the real date.', NULL::date, NULL)
) AS v(wio_number, project, scope, raised_by, wio_issued, stage, since, notes, pio_released, pio_no)
JOIN ee.tracker_stages s ON s.stage = v.stage
ON CONFLICT (wio_number) DO NOTHING;

-- ---------------------------------------------------------------------
-- The 24 logged delays — all Open. Each references its WIO by number.
-- cause/source are stored as they were logged, never re-derived, so a later
-- re-classification of a reason cannot rewrite what was recorded.
-- ---------------------------------------------------------------------
INSERT INTO ee.tracker_delays
  (log_date, wio_id, why, cause, source, owner, dept, started, ended, days_lost, status, remark)
SELECT v.log_date, t.id, v.why, v.cause, v.source, v.owner, v.dept,
       v.started, v.ended, v.days_lost, v.status, v.remark
FROM (VALUES
  (DATE '2026-08-24', 'ED/26-27/086', 'CRM · PIO not raised', 'CRM', 'Internal', 'Nimisha', 'CRM', DATE '2026-08-13', NULL::date, 12, 'Open', 'Drawings final 13 Aug. Sign-off done, client clear. Only the PIO is outstanding.'),
  (DATE '2026-08-24', 'ED/26-27/111', 'CRM · PIO not raised', 'CRM', 'Internal', 'Rohit', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', NULL),
  (DATE '2026-08-24', 'ED/26-27/097', 'CRM · PIO not raised', 'CRM', 'Internal', 'Rohit', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', NULL),
  (DATE '2026-08-24', 'ED/26-27/092', 'CRM · PIO not raised', 'CRM', 'Internal', 'Aparna', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', NULL),
  (DATE '2026-08-24', 'ED/26-27/106', 'Client · Approval delay', 'Client', 'Client', 'Client', 'Client', DATE '2026-08-24', NULL::date, 1, 'Open', 'Finish discussion still open.'),
  (DATE '2026-08-24', 'ED/26-27/089', 'Sign-off · Not returned', 'Sign-off', 'Internal', 'Khushpreet', 'Design Room', DATE '2026-08-24', NULL::date, 1, 'Open', NULL),
  (DATE '2026-08-24', 'ED/26-27/090', 'Sign-off · Not returned', 'Sign-off', 'Internal', 'Khushpreet', 'Design Room', DATE '2026-08-24', NULL::date, 1, 'Open', 'Due tomorrow.'),
  (DATE '2026-08-24', 'ED/26-27/084', 'Finishes · Not finalised', 'Finishes', 'Client', 'Client', 'Client', DATE '2026-08-24', NULL::date, 1, 'Open', '17 finishes open, 7 items on hold.'),
  (DATE '2026-08-24', 'ED/26-27/046', 'Site · Not ready', 'Site', 'Client', 'Client', 'Client', DATE '2026-08-24', NULL::date, 1, 'Open', 'Six categories drawn and waiting.'),
  (DATE '2026-08-24', 'ED/26-27/121', 'Drawing · Not started', 'Drawing', 'Internal', 'Nimisha', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', 'All three categories.'),
  (DATE '2026-08-24', 'ED/26-27/015', 'CRM · Input not given', 'CRM', 'Internal', 'Bhavya', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', 'Appliances pending. Media unit under client discussion.'),
  (DATE '2026-08-24', 'ED/25-26/173', 'CRM · PIO not raised', 'CRM', 'Internal', 'Tanisha', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', 'Everything clear. Last year''s WIO still open.'),
  (DATE '2026-08-24', 'ED/26-27/099', 'CRM · PIO not raised', 'CRM', 'Internal', 'Tanvi', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', NULL),
  (DATE '2026-08-24', 'ED/26-27/122', 'CRM · PIO not raised', 'CRM', 'Internal', 'Riya', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', '1 door handle also on hold by CRM.'),
  (DATE '2026-08-24', 'ED/26-27/098', 'Sign-off · Not returned', 'Sign-off', 'Internal', 'Khushpreet', 'Design Room', DATE '2026-08-24', NULL::date, 1, 'Open', 'Held by the revision of offsite work.'),
  (DATE '2026-08-24', 'ED/26-27/081', 'CRM · Input not given', 'CRM', 'Internal', 'Ishika Tibrewal', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', 'Storage SLD not provided by CRM.'),
  (DATE '2026-08-24', 'ED/26-27/018', 'Site · Not ready', 'Site', 'Client', 'Client', 'Client', DATE '2026-08-24', NULL::date, 1, 'Open', '1 vanity and 1 mirror drawing held — site not ready.'),
  (DATE '2026-08-24', 'ED/26-27/057', 'CRM · Input not given', 'CRM', 'Internal', 'Sahil Mehta', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', '6 furniture finishes pending from CRM.'),
  (DATE '2026-08-24', 'ED/26-27/053', 'Finishes · Not finalised', 'Finishes', 'Client', 'Client', 'Client', DATE '2026-08-24', NULL::date, 1, 'Open', 'Metal sample made, not approved.'),
  (DATE '2026-08-24', 'ED/26-27/100', 'Client · Approval delay', 'Client', 'Client', 'Client', 'Client', DATE '2026-08-24', NULL::date, 1, 'Open', 'Drawing on hold from the client side.'),
  (DATE '2026-08-24', 'ED/26-27/136', 'CRM · Input not given', 'CRM', 'Internal', 'Sahil Mehta', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', 'CRM to provide the door drawing.'),
  (DATE '2026-08-24', 'ED/26-27/133', 'Drawing · Not started', 'Drawing', 'Internal', 'Sahil Mehta', 'CRM', DATE '2026-08-24', NULL::date, 1, 'Open', 'Promised date already three weeks past.'),
  (DATE '2026-08-25', 'ED/26-27/120', 'Client · Approval delay', 'Client', 'Client', 'Ishaan Sachar', 'CRM', DATE '2026-07-27', NULL::date, 29, 'Open', 'Client · Approval delay'),
  (DATE '2026-08-26', 'ED/26-27/109', 'Client · Approval delay', 'Client', 'Client', 'Ishaan Sachar', 'CRM', DATE '2026-07-27', NULL::date, 29, 'Open', 'Client · Approval delay')
) AS v(log_date, wio_number, why, cause, source, owner, dept, started, ended, days_lost, status, remark)
JOIN ee.tracker_wios t ON t.wio_number = v.wio_number
WHERE NOT EXISTS (
  SELECT 1 FROM ee.tracker_delays x
   WHERE x.wio_id = t.id AND x.why = v.why AND x.log_date = v.log_date
);
