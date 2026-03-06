-- ============================================================
-- DEMO SEED — TEST ORGANIZATION
-- org_id: 1aead71c-6bd4-484d-935d-36d6aa2b2f1b
--
-- Run this in your Supabase SQL Editor.
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING.
-- ============================================================

-- -------------------------------------------------------
-- DONORS (30 total)
--   17 Active  |  6 New  |  4 Lapsed  |  3 Lost
-- -------------------------------------------------------
INSERT INTO donors (
  id, org_id,
  display_name, first_name, last_name,
  email, phone, billing_address, city, state, zip,
  location_lat, location_lng,
  total_lifetime_value, last_donation_date
) VALUES

-- ── MAJOR DONORS (Active) ──────────────────────────────
('d0000001-0000-0000-0000-000000000001','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Robert & Patricia Anderson','Robert','Anderson',
 'robert.anderson@email.com','(615) 555-0101','142 Hillside Dr','Nashville','TN','37205',
 36.1450,-86.8200, 15000.00,'2025-12-15'),

('d0000002-0000-0000-0000-000000000002','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'William & Barbara Johnson','William','Johnson',
 'bjohnson@nashvillelaw.com','(615) 555-0102','307 Belle Meade Blvd','Nashville','TN','37205',
 36.1298,-86.8655, 22000.00,'2026-01-20'),

('d0000003-0000-0000-0000-000000000003','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Stephanie Miller','Stephanie','Miller',
 'smiller@franklingroup.com','(615) 555-0103','88 Forrest Crossing','Franklin','TN','37064',
 35.9251,-86.8689, 18500.00,'2025-11-30'),

('d0000004-0000-0000-0000-000000000004','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'David & Linda Thompson','David','Thompson',
 'dthompson@email.com','(615) 555-0104','1820 Chickering Rd','Nashville','TN','37215',
 36.1100,-86.8300, 12000.00,'2025-09-10'),

-- ── ACTIVE REGULAR DONORS ─────────────────────────────
('d0000005-0000-0000-0000-000000000005','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'James Wilson','James','Wilson',
 'james.wilson@email.com','(404) 555-0105','512 Peachtree Ct','Atlanta','GA','30309',
 33.7800,-84.3720, 3200.00,'2026-01-05'),

('d0000006-0000-0000-0000-000000000006','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Christopher Martinez','Christopher','Martinez',
 'cmartinez@email.com','(615) 555-0106','234 West End Ave','Nashville','TN','37203',
 36.1527,-86.8056, 2800.00,'2025-12-28'),

('d0000007-0000-0000-0000-000000000007','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Joseph Wilson','Joseph','Wilson',
 'jwilson@email.com','(615) 555-0107','891 Linden Ave','Nashville','TN','37212',
 36.1380,-86.7960, 1900.00,'2025-11-15'),

('d0000008-0000-0000-0000-000000000008','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Brian Jackson','Brian','Jackson',
 'bjackson@email.com','(615) 555-0108','44 Woodmont Blvd','Nashville','TN','37205',
 36.1350,-86.8450, 2400.00,'2026-01-18'),

('d0000009-0000-0000-0000-000000000009','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Tyler Walker','Tyler','Walker',
 'twalker@email.com','(615) 555-0109','1205 Granny White Pike','Nashville','TN','37220',
 36.0780,-86.7950, 1600.00,'2025-12-20'),

('d0000010-0000-0000-0000-000000000010','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Melissa Taylor','Melissa','Taylor',
 'mtaylor@email.com','(615) 555-0110','305 Harding Place','Nashville','TN','37211',
 36.0950,-86.7650, 1200.00,'2025-10-30'),

('d0000011-0000-0000-0000-000000000011','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Jessica Anderson','Jessica','Anderson',
 'jessica.a@email.com','(615) 555-0111','722 Nichol Mill Ln','Franklin','TN','37067',
 35.9180,-86.8510, 2100.00,'2025-11-22'),

('d0000012-0000-0000-0000-000000000012','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Justin Clark','Justin','Clark',
 'jclark@email.com','(615) 555-0112','1500 Old Hickory Blvd','Brentwood','TN','37027',
 36.0330,-86.7820, 900.00,'2025-09-05'),

('d0000013-0000-0000-0000-000000000013','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Amber Hall','Amber','Hall',
 'amber.hall@email.com','(615) 555-0113','28 Belcourt Ave','Nashville','TN','37212',
 36.1430,-86.7870, 1400.00,'2025-10-12'),

('d0000014-0000-0000-0000-000000000014','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Lauren Robinson','Lauren','Robinson',
 'lrobinson@email.com','(615) 555-0114','400 Lynnwood Blvd','Nashville','TN','37205',
 36.1250,-86.8600, 1750.00,'2025-08-18'),

('d0000015-0000-0000-0000-000000000015','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Ashley Taylor','Ashley','Taylor',
 'ataylor@email.com','(901) 555-0115','3301 Poplar Ave','Memphis','TN','38111',
 35.1350,-90.0120, 800.00,'2025-10-05'),

('d0000016-0000-0000-0000-000000000016','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Rebecca Jones','Rebecca','Jones',
 'rjones@email.com','(423) 555-0116','715 Signal Mountain Rd','Chattanooga','TN','37405',
 35.0650,-85.3400, 1100.00,'2025-07-22'),

('d0000017-0000-0000-0000-000000000017','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Michael Chen','Michael','Chen',
 'mchen@email.com','(901) 555-0117','881 Union Ave','Memphis','TN','38103',
 35.1460,-90.0580, 650.00,'2025-09-28'),

-- ── NEW DONORS (within last 3 months) ─────────────────
('d0000018-0000-0000-0000-000000000018','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Sarah Mitchell','Sarah','Mitchell',
 'sarah.mitchell@email.com','(704) 555-0118','2240 Park Rd','Charlotte','NC','28203',
 35.2050,-80.8530, 250.00,'2026-01-14'),

('d0000019-0000-0000-0000-000000000019','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Emily Rodriguez','Emily','Rodriguez',
 'erodriguez@email.com','(704) 555-0119','445 Hawthorne Ln','Charlotte','NC','28204',
 35.2120,-80.8410, 150.00,'2025-12-10'),

('d0000020-0000-0000-0000-000000000020','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Kevin Harris','Kevin','Harris',
 'kharris@email.com','(615) 555-0120','1024 Riverside Dr','Nashville','TN','37206',
 36.1685,-86.7450, 500.00,'2026-02-05'),

('d0000021-0000-0000-0000-000000000021','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Nicole Moore','Nicole','Moore',
 'nmoore@email.com','(615) 555-0121','678 Fatherland St','Nashville','TN','37206',
 36.1720,-86.7380, 200.00,'2025-12-18'),

('d0000022-0000-0000-0000-000000000022','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Ryan Martinez','Ryan','Martinez',
 'ryan.m@email.com','(615) 555-0122','512 Meridian St','Nashville','TN','37207',
 36.1850,-86.7620, 350.00,'2026-01-30'),

('d0000023-0000-0000-0000-000000000023','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Nathan Young','Nathan','Young',
 'nyoung@email.com','(615) 555-0123','200 Shelby Ave','Nashville','TN','37206',
 36.1655,-86.7480, 100.00,'2026-01-25'),

-- ── LAPSED DONORS (13–22 months since last gift) ──────
('d0000024-0000-0000-0000-000000000024','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Jennifer Davis','Jennifer','Davis',
 'jen.davis@email.com','(404) 555-0124','1820 Monroe Dr NE','Atlanta','GA','30324',
 33.7950,-84.3620, 2200.00,'2024-10-15'),

('d0000025-0000-0000-0000-000000000025','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Daniel Lee','Daniel','Lee',
 'dlee@email.com','(865) 555-0125','455 Gay St','Knoxville','TN','37902',
 35.9680,-83.9180, 1400.00,'2024-12-08'),

('d0000026-0000-0000-0000-000000000026','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Amanda White','Amanda','White',
 'awhite@email.com','(615) 555-0126','1134 Caldwell Dr','Nashville','TN','37204',
 36.1150,-86.7750, 850.00,'2024-08-20'),

('d0000027-0000-0000-0000-000000000027','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Andrew Thomas','Andrew','Thomas',
 'athomas@email.com','(901) 555-0127','2050 Madison Ave','Memphis','TN','38104',
 35.1420,-90.0320, 1100.00,'2024-06-14'),

-- ── LOST DONORS (24+ months since last gift) ──────────
('d0000028-0000-0000-0000-000000000028','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Thomas Brown','Thomas','Brown',
 'tbrown@email.com','(205) 555-0128','2100 Highland Ave S','Birmingham','AL','35205',
 33.4950,-86.7980, 800.00,'2023-10-22'),

('d0000029-0000-0000-0000-000000000029','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Matthew Garcia','Matthew','Garcia',
 'mgarcia@email.com','(502) 555-0129','408 W Broadway','Louisville','KY','40202',
 38.2550,-85.7620, 450.00,'2023-08-10'),

('d0000030-0000-0000-0000-000000000030','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Megan Lewis','Megan','Lewis',
 'mlewis@email.com','(615) 555-0130','3344 Hillsboro Pike','Nashville','TN','37215',
 36.1020,-86.8120, 1200.00,'2023-12-01')

ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- TAGS (5 org-level labels)
-- -------------------------------------------------------
INSERT INTO tags (id, organization_id, name, color) VALUES
('cc000001-0000-0000-0000-000000000001','1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Major Donor','green'),
('cc000002-0000-0000-0000-000000000002','1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Board Member','blue'),
('cc000003-0000-0000-0000-000000000003','1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Monthly Donor','orange'),
('cc000004-0000-0000-0000-000000000004','1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Volunteer','gray'),
('cc000005-0000-0000-0000-000000000005','1aead71c-6bd4-484d-935d-36d6aa2b2f1b','First-Time Donor','red')
ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- DONOR TAGS
-- -------------------------------------------------------
INSERT INTO donor_tags (donor_id, tag_id) VALUES
-- Major Donor tag
('d0000001-0000-0000-0000-000000000001','cc000001-0000-0000-0000-000000000001'),
('d0000002-0000-0000-0000-000000000002','cc000001-0000-0000-0000-000000000001'),
('d0000003-0000-0000-0000-000000000003','cc000001-0000-0000-0000-000000000001'),
('d0000004-0000-0000-0000-000000000004','cc000001-0000-0000-0000-000000000001'),
-- Board Member tag
('d0000001-0000-0000-0000-000000000001','cc000002-0000-0000-0000-000000000002'),
('d0000002-0000-0000-0000-000000000002','cc000002-0000-0000-0000-000000000002'),
('d0000004-0000-0000-0000-000000000004','cc000002-0000-0000-0000-000000000002'),
-- Monthly Donor tag
('d0000005-0000-0000-0000-000000000005','cc000003-0000-0000-0000-000000000003'),
('d0000006-0000-0000-0000-000000000006','cc000003-0000-0000-0000-000000000003'),
('d0000008-0000-0000-0000-000000000008','cc000003-0000-0000-0000-000000000003'),
('d0000009-0000-0000-0000-000000000009','cc000003-0000-0000-0000-000000000003'),
-- Volunteer tag
('d0000015-0000-0000-0000-000000000015','cc000004-0000-0000-0000-000000000004'),
('d0000017-0000-0000-0000-000000000017','cc000004-0000-0000-0000-000000000004'),
-- First-Time Donor tag
('d0000018-0000-0000-0000-000000000018','cc000005-0000-0000-0000-000000000005'),
('d0000019-0000-0000-0000-000000000019','cc000005-0000-0000-0000-000000000005'),
('d0000020-0000-0000-0000-000000000020','cc000005-0000-0000-0000-000000000005'),
('d0000022-0000-0000-0000-000000000022','cc000005-0000-0000-0000-000000000005'),
('d0000023-0000-0000-0000-000000000023','cc000005-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------
-- DONATIONS
-- -------------------------------------------------------
INSERT INTO donations (id, donor_id, amount, date, memo) VALUES

-- Robert & Patricia Anderson — major, 4 gifts
(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001', 2500.00,'2025-12-15','Year-End Gift — 2025-12-15'),
(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001', 5000.00,'2025-04-10','Capital Campaign — 2025-04-10'),
(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001', 3000.00,'2024-12-18','Year-End Gift — 2024-12-18'),
(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001', 4500.00,'2024-04-05','Capital Campaign — 2024-04-05'),

-- William & Barbara Johnson — major, 4 gifts
(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002', 5000.00,'2026-01-20','General Fund — 2026-01-20'),
(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002', 7000.00,'2025-06-12','Building Fund — 2025-06-12'),
(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002', 5000.00,'2025-01-08','Annual Fund — 2025-01-08'),
(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002', 5000.00,'2024-06-01','Building Fund — 2024-06-01'),

-- Stephanie Miller — major, 4 gifts
(gen_random_uuid(),'d0000003-0000-0000-0000-000000000003', 5000.00,'2025-11-30','Year-End Gift — 2025-11-30'),
(gen_random_uuid(),'d0000003-0000-0000-0000-000000000003', 3500.00,'2025-07-15','General Fund — 2025-07-15'),
(gen_random_uuid(),'d0000003-0000-0000-0000-000000000003', 5000.00,'2025-01-10','Annual Fund — 2025-01-10'),
(gen_random_uuid(),'d0000003-0000-0000-0000-000000000003', 5000.00,'2024-07-20','Capital Campaign — 2024-07-20'),

-- David & Linda Thompson — major, 4 gifts
(gen_random_uuid(),'d0000004-0000-0000-0000-000000000004', 3000.00,'2025-09-10','General Fund — 2025-09-10'),
(gen_random_uuid(),'d0000004-0000-0000-0000-000000000004', 4000.00,'2025-03-05','Easter Offering — 2025-03-05'),
(gen_random_uuid(),'d0000004-0000-0000-0000-000000000004', 3000.00,'2024-09-15','General Fund — 2024-09-15'),
(gen_random_uuid(),'d0000004-0000-0000-0000-000000000004', 2000.00,'2024-02-20','Annual Fund — 2024-02-20'),

-- James Wilson — monthly $200, 16 months
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2026-01-05','Monthly Gift — 2026-01-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-12-05','Monthly Gift — 2025-12-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-11-05','Monthly Gift — 2025-11-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-10-05','Monthly Gift — 2025-10-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-09-05','Monthly Gift — 2025-09-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-08-05','Monthly Gift — 2025-08-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-07-05','Monthly Gift — 2025-07-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-06-05','Monthly Gift — 2025-06-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-05-05','Monthly Gift — 2025-05-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-04-05','Monthly Gift — 2025-04-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-03-05','Monthly Gift — 2025-03-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-02-05','Monthly Gift — 2025-02-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2025-01-05','Monthly Gift — 2025-01-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2024-12-05','Monthly Gift — 2024-12-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2024-11-05','Monthly Gift — 2024-11-05'),
(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005', 200.00,'2024-10-05','Monthly Gift — 2024-10-05'),

-- Christopher Martinez — monthly $200, 14 months
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-12-28','Monthly Gift — 2025-12-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-11-28','Monthly Gift — 2025-11-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-10-28','Monthly Gift — 2025-10-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-09-28','Monthly Gift — 2025-09-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-08-28','Monthly Gift — 2025-08-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-07-28','Monthly Gift — 2025-07-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-06-28','Monthly Gift — 2025-06-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-05-28','Monthly Gift — 2025-05-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-04-28','Monthly Gift — 2025-04-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-03-28','Monthly Gift — 2025-03-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-02-28','Monthly Gift — 2025-02-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2025-01-28','Monthly Gift — 2025-01-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2024-12-28','Monthly Gift — 2024-12-28'),
(gen_random_uuid(),'d0000006-0000-0000-0000-000000000006', 200.00,'2024-11-28','Monthly Gift — 2024-11-28'),

-- Joseph Wilson — quarterly gifts
(gen_random_uuid(),'d0000007-0000-0000-0000-000000000007', 500.00,'2025-11-15','General Fund — 2025-11-15'),
(gen_random_uuid(),'d0000007-0000-0000-0000-000000000007', 500.00,'2025-08-10','General Fund — 2025-08-10'),
(gen_random_uuid(),'d0000007-0000-0000-0000-000000000007', 500.00,'2025-05-05','Easter Offering — 2025-05-05'),
(gen_random_uuid(),'d0000007-0000-0000-0000-000000000007', 400.00,'2025-01-20','Annual Fund — 2025-01-20'),

-- Brian Jackson — monthly $200, 12 months
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2026-01-18','Monthly Gift — 2026-01-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-12-18','Monthly Gift — 2025-12-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-11-18','Monthly Gift — 2025-11-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-10-18','Monthly Gift — 2025-10-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-09-18','Monthly Gift — 2025-09-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-08-18','Monthly Gift — 2025-08-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-07-18','Monthly Gift — 2025-07-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-06-18','Monthly Gift — 2025-06-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-05-18','Monthly Gift — 2025-05-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-04-18','Monthly Gift — 2025-04-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-03-18','Monthly Gift — 2025-03-18'),
(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008', 200.00,'2025-02-18','Monthly Gift — 2025-02-18'),

-- Tyler Walker — monthly $100, 16 months
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-12-20','Monthly Gift — 2025-12-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-11-20','Monthly Gift — 2025-11-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-10-20','Monthly Gift — 2025-10-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-09-20','Monthly Gift — 2025-09-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-08-20','Monthly Gift — 2025-08-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-07-20','Monthly Gift — 2025-07-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-06-20','Monthly Gift — 2025-06-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-05-20','Monthly Gift — 2025-05-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-04-20','Monthly Gift — 2025-04-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-03-20','Monthly Gift — 2025-03-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-02-20','Monthly Gift — 2025-02-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2025-01-20','Monthly Gift — 2025-01-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2024-12-20','Monthly Gift — 2024-12-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2024-11-20','Monthly Gift — 2024-11-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2024-10-20','Monthly Gift — 2024-10-20'),
(gen_random_uuid(),'d0000009-0000-0000-0000-000000000009', 100.00,'2024-09-20','Monthly Gift — 2024-09-20'),

-- Melissa Taylor — 3 gifts
(gen_random_uuid(),'d0000010-0000-0000-0000-000000000010', 500.00,'2025-10-30','General Fund — 2025-10-30'),
(gen_random_uuid(),'d0000010-0000-0000-0000-000000000010', 400.00,'2025-05-14','Easter Offering — 2025-05-14'),
(gen_random_uuid(),'d0000010-0000-0000-0000-000000000010', 300.00,'2025-01-12','Annual Fund — 2025-01-12'),

-- Jessica Anderson — 3 gifts
(gen_random_uuid(),'d0000011-0000-0000-0000-000000000011', 700.00,'2025-11-22','Year-End Gift — 2025-11-22'),
(gen_random_uuid(),'d0000011-0000-0000-0000-000000000011', 700.00,'2025-06-08','General Fund — 2025-06-08'),
(gen_random_uuid(),'d0000011-0000-0000-0000-000000000011', 700.00,'2025-01-15','Annual Fund — 2025-01-15'),

-- Justin Clark — 3 gifts
(gen_random_uuid(),'d0000012-0000-0000-0000-000000000012', 300.00,'2025-09-05','General Fund — 2025-09-05'),
(gen_random_uuid(),'d0000012-0000-0000-0000-000000000012', 300.00,'2025-04-18','Easter Offering — 2025-04-18'),
(gen_random_uuid(),'d0000012-0000-0000-0000-000000000012', 300.00,'2025-01-09','Annual Fund — 2025-01-09'),

-- Amber Hall — 3 gifts
(gen_random_uuid(),'d0000013-0000-0000-0000-000000000013', 500.00,'2025-10-12','General Fund — 2025-10-12'),
(gen_random_uuid(),'d0000013-0000-0000-0000-000000000013', 500.00,'2025-05-20','Easter Offering — 2025-05-20'),
(gen_random_uuid(),'d0000013-0000-0000-0000-000000000013', 400.00,'2025-01-18','Annual Fund — 2025-01-18'),

-- Lauren Robinson — quarterly
(gen_random_uuid(),'d0000014-0000-0000-0000-000000000014', 500.00,'2025-08-18','General Fund — 2025-08-18'),
(gen_random_uuid(),'d0000014-0000-0000-0000-000000000014', 500.00,'2025-05-10','General Fund — 2025-05-10'),
(gen_random_uuid(),'d0000014-0000-0000-0000-000000000014', 500.00,'2025-02-08','Annual Fund — 2025-02-08'),
(gen_random_uuid(),'d0000014-0000-0000-0000-000000000014', 250.00,'2024-11-20','Year-End Gift — 2024-11-20'),

-- Ashley Taylor — 3 gifts
(gen_random_uuid(),'d0000015-0000-0000-0000-000000000015', 300.00,'2025-10-05','General Fund — 2025-10-05'),
(gen_random_uuid(),'d0000015-0000-0000-0000-000000000015', 300.00,'2025-05-01','Easter Offering — 2025-05-01'),
(gen_random_uuid(),'d0000015-0000-0000-0000-000000000015', 200.00,'2025-01-14','Annual Fund — 2025-01-14'),

-- Rebecca Jones — 3 gifts
(gen_random_uuid(),'d0000016-0000-0000-0000-000000000016', 400.00,'2025-07-22','General Fund — 2025-07-22'),
(gen_random_uuid(),'d0000016-0000-0000-0000-000000000016', 400.00,'2025-03-12','Easter Offering — 2025-03-12'),
(gen_random_uuid(),'d0000016-0000-0000-0000-000000000016', 300.00,'2024-12-10','Year-End Gift — 2024-12-10'),

-- Michael Chen — 3 gifts
(gen_random_uuid(),'d0000017-0000-0000-0000-000000000017', 250.00,'2025-09-28','General Fund — 2025-09-28'),
(gen_random_uuid(),'d0000017-0000-0000-0000-000000000017', 250.00,'2025-04-22','Easter Offering — 2025-04-22'),
(gen_random_uuid(),'d0000017-0000-0000-0000-000000000017', 150.00,'2025-01-05','Annual Fund — 2025-01-05'),

-- New donors — 1 gift each
(gen_random_uuid(),'d0000018-0000-0000-0000-000000000018', 250.00,'2026-01-14','First Gift — 2026-01-14'),
(gen_random_uuid(),'d0000019-0000-0000-0000-000000000019', 150.00,'2025-12-10','First Gift — 2025-12-10'),
(gen_random_uuid(),'d0000020-0000-0000-0000-000000000020', 500.00,'2026-02-05','First Gift — 2026-02-05'),
(gen_random_uuid(),'d0000021-0000-0000-0000-000000000021', 200.00,'2025-12-18','First Gift — 2025-12-18'),
(gen_random_uuid(),'d0000022-0000-0000-0000-000000000022', 350.00,'2026-01-30','First Gift — 2026-01-30'),
(gen_random_uuid(),'d0000023-0000-0000-0000-000000000023', 100.00,'2026-01-25','First Gift — 2026-01-25'),

-- Lapsed donors — last gift 13-22 months ago
(gen_random_uuid(),'d0000024-0000-0000-0000-000000000024', 800.00,'2024-10-15','General Fund — 2024-10-15'),
(gen_random_uuid(),'d0000024-0000-0000-0000-000000000024', 700.00,'2024-03-10','Easter Offering — 2024-03-10'),
(gen_random_uuid(),'d0000024-0000-0000-0000-000000000024', 700.00,'2023-12-05','Year-End Gift — 2023-12-05'),
(gen_random_uuid(),'d0000025-0000-0000-0000-000000000025', 500.00,'2024-12-08','Year-End Gift — 2024-12-08'),
(gen_random_uuid(),'d0000025-0000-0000-0000-000000000025', 500.00,'2024-06-15','General Fund — 2024-06-15'),
(gen_random_uuid(),'d0000025-0000-0000-0000-000000000025', 400.00,'2024-01-20','Annual Fund — 2024-01-20'),
(gen_random_uuid(),'d0000026-0000-0000-0000-000000000026', 350.00,'2024-08-20','General Fund — 2024-08-20'),
(gen_random_uuid(),'d0000026-0000-0000-0000-000000000026', 300.00,'2024-03-05','Easter Offering — 2024-03-05'),
(gen_random_uuid(),'d0000026-0000-0000-0000-000000000026', 200.00,'2023-12-12','Year-End Gift — 2023-12-12'),
(gen_random_uuid(),'d0000027-0000-0000-0000-000000000027', 400.00,'2024-06-14','General Fund — 2024-06-14'),
(gen_random_uuid(),'d0000027-0000-0000-0000-000000000027', 400.00,'2024-01-08','Annual Fund — 2024-01-08'),
(gen_random_uuid(),'d0000027-0000-0000-0000-000000000027', 300.00,'2023-09-18','General Fund — 2023-09-18'),

-- Lost donors — last gift 24+ months ago
(gen_random_uuid(),'d0000028-0000-0000-0000-000000000028', 400.00,'2023-10-22','General Fund — 2023-10-22'),
(gen_random_uuid(),'d0000028-0000-0000-0000-000000000028', 400.00,'2023-04-15','Easter Offering — 2023-04-15'),
(gen_random_uuid(),'d0000029-0000-0000-0000-000000000029', 250.00,'2023-08-10','General Fund — 2023-08-10'),
(gen_random_uuid(),'d0000029-0000-0000-0000-000000000029', 200.00,'2023-02-14','Annual Fund — 2023-02-14'),
(gen_random_uuid(),'d0000030-0000-0000-0000-000000000030', 500.00,'2023-12-01','Year-End Gift — 2023-12-01'),
(gen_random_uuid(),'d0000030-0000-0000-0000-000000000030', 400.00,'2023-06-20','General Fund — 2023-06-20'),
(gen_random_uuid(),'d0000030-0000-0000-0000-000000000030', 300.00,'2023-01-10','Annual Fund — 2023-01-10');


-- -------------------------------------------------------
-- INTERACTIONS (calls, emails, meetings for key donors)
-- -------------------------------------------------------
INSERT INTO interactions (id, donor_id, type, direction, subject, content, date, status) VALUES

(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001',
 'call','outbound','Annual Fund Follow-Up',
 'Spoke with Robert about the upcoming capital campaign. He expressed strong interest in a leadership gift and asked for a meeting with the pastor.',
 '2025-11-20','completed'),

(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001',
 'meeting','outbound','Capital Campaign Meeting',
 'Met with Robert and Patricia over coffee. They committed to a $5,000 leadership gift for the new sanctuary wing. Patricia asked to be included on the building committee updates.',
 '2025-12-01','completed'),

(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002',
 'meeting','outbound','Building Fund Presentation',
 'Presented the building fund case to William and Barbara. They were enthusiastic and pledged $7,000. Barbara suggested we recognize major donors on a donor wall.',
 '2025-06-05','completed'),

(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002',
 'email','outbound','Thank You — Building Fund Gift',
 'Sent personal thank-you note for the $7,000 building fund gift. Included a photo of the groundbreaking.',
 '2025-06-20','completed'),

(gen_random_uuid(),'d0000003-0000-0000-0000-000000000003',
 'call','outbound','Year-End Giving Conversation',
 'Called Stephanie to discuss year-end giving. She mentioned she was considering a larger gift in Q1 2026. Set a reminder to follow up in January.',
 '2025-11-10','completed'),

(gen_random_uuid(),'d0000004-0000-0000-0000-000000000004',
 'call','outbound','Board Meeting Prep',
 'Connected with David ahead of the board meeting. He confirmed attendance and asked for the annual report to review ahead of time.',
 '2025-09-02','completed'),

(gen_random_uuid(),'d0000005-0000-0000-0000-000000000005',
 'email','inbound','Monthly Giving Question',
 'James emailed asking how to update his monthly giving amount. Replied with instructions for the online portal.',
 '2025-10-15','completed'),

(gen_random_uuid(),'d0000024-0000-0000-0000-000000000024',
 'call','outbound','Reconnect — Lapsed Donor',
 'Attempted to reach Jennifer by phone. No answer — left a voicemail introducing myself and inviting her to our upcoming fall event.',
 '2025-12-05','completed'),

(gen_random_uuid(),'d0000024-0000-0000-0000-000000000024',
 'email','outbound','Fall Event Invitation',
 'Sent Jennifer an invitation to the annual ministry banquet along with a personal note from the pastor.',
 '2025-12-08','completed'),

(gen_random_uuid(),'d0000025-0000-0000-0000-000000000025',
 'call','outbound','Year-End Outreach',
 'Spoke briefly with Daniel. He mentioned a job transition had affected his giving but hopes to resume in the new year. Sending a handwritten note.',
 '2025-01-08','completed'),

(gen_random_uuid(),'d0000020-0000-0000-0000-000000000020',
 'email','inbound','First-Time Donor Thank You',
 'Kevin replied to our welcome email saying he found the ministry through a friend and is excited to get more involved.',
 '2026-02-10','completed'),

(gen_random_uuid(),'d0000008-0000-0000-0000-000000000008',
 'task',null,'Schedule Volunteer Appreciation Dinner',
 'Reach out to Brian and other monthly donors to invite them to the volunteer appreciation dinner in March.',
 '2026-03-01','pending');


-- -------------------------------------------------------
-- OPPORTUNITIES (pipeline)
-- -------------------------------------------------------
INSERT INTO opportunities (id, organization_id, donor_id, title, amount, status, expected_date) VALUES

(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'd0000001-0000-0000-0000-000000000001',
 'Capital Campaign Leadership Gift', 10000.00, 'solicited', '2026-03-31'),

(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'd0000002-0000-0000-0000-000000000002',
 'Sanctuary Building Fund', 15000.00, 'committed', '2026-04-15'),

(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'd0000003-0000-0000-0000-000000000003',
 'Q1 Annual Fund Gift', 5000.00, 'qualified', '2026-03-15'),

(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'd0000004-0000-0000-0000-000000000004',
 'Endowment Pledge', 8000.00, 'identified', '2026-06-30'),

(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'd0000024-0000-0000-0000-000000000024',
 'Lapsed Donor Re-Engagement', 1000.00, 'identified', '2026-04-01');


-- -------------------------------------------------------
-- DONOR NOTES (visible on donor profiles)
-- -------------------------------------------------------
INSERT INTO donor_notes (id, donor_id, note, created_at) VALUES

(gen_random_uuid(),'d0000001-0000-0000-0000-000000000001',
 'Robert is a retired attorney. Patricia is very involved in the prayer ministry. Best time to reach them is Tuesday mornings.',
 '2025-10-01 09:00:00+00'),

(gen_random_uuid(),'d0000002-0000-0000-0000-000000000002',
 'William runs a law firm downtown. He prefers email over phone. Barbara is on the worship team.',
 '2025-08-15 10:30:00+00'),

(gen_random_uuid(),'d0000003-0000-0000-0000-000000000003',
 'Stephanie owns a financial advisory practice in Franklin. Interested in estate planning / legacy giving.',
 '2025-07-20 14:00:00+00'),

(gen_random_uuid(),'d0000004-0000-0000-0000-000000000004',
 'David served on the building committee for the 2018 renovation. Great advocate for facilities projects.',
 '2025-06-10 11:00:00+00'),

(gen_random_uuid(),'d0000024-0000-0000-0000-000000000024',
 'Jennifer relocated to Atlanta for work in 2024. Still has family connections here. Worth re-engaging for the annual fund.',
 '2025-11-30 09:00:00+00'),

(gen_random_uuid(),'d0000025-0000-0000-0000-000000000025',
 'Daniel mentioned a career transition impacting finances. Follow up in spring 2026 — do not solicit until then.',
 '2025-01-10 10:00:00+00');
