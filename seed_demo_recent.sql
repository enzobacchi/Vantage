-- ============================================================
-- DEMO SEED — RECENT DONATIONS (last ~35 days)
-- org_id: 1aead71c-6bd4-484d-935d-36d6aa2b2f1b
--
-- Populates:
--   • Recent Gifts list on the Home screen (last 20)
--   • Revenue Trend chart (30-day daily aggregate)
--
-- Run AFTER seed_demo.sql and seed_demo_v2.sql. Safe to re-run
-- (uses gen_random_uuid() + ON CONFLICT-equivalent via org_id scoping).
--
-- Today anchor: 2026-04-19
-- ============================================================

-- ------------------------------------------------------------
-- 1) Backfill org_id on any existing donations missing it.
--    (Older seeds didn't set donations.org_id; the dashboard API
--     filters by org_id so rows with NULL org_id are invisible.)
-- ------------------------------------------------------------
UPDATE donations d
SET    org_id = dn.org_id
FROM   donors dn
WHERE  d.donor_id = dn.id
  AND  d.org_id IS NULL;


-- ------------------------------------------------------------
-- 2) Insert recent donations spread across the last 35 days.
--    Mix of sizes: monthly recurring (~$100–$200),
--    mid-range gifts ($500–$1,500), and a few majors ($2,500+).
-- ------------------------------------------------------------
INSERT INTO donations (id, org_id, donor_id, amount, date, memo, source) VALUES

-- Last 7 days (Apr 13 – Apr 19) ------------------------------
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000002-0000-0000-0000-000000000002', 5000.00,'2026-04-19','Spring Campaign — 2026-04-19','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000033-0000-0000-0000-000000000033', 1200.00,'2026-04-18','General Fund — 2026-04-18','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000005-0000-0000-0000-000000000005',  200.00,'2026-04-17','Monthly Gift — 2026-04-17','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000045-0000-0000-0000-000000000045', 2500.00,'2026-04-16','Capital Campaign — 2026-04-16','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000011-0000-0000-0000-000000000011',  500.00,'2026-04-15','Easter Offering — 2026-04-15','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000009-0000-0000-0000-000000000009',  100.00,'2026-04-15','Monthly Gift — 2026-04-15','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000039-0000-0000-0000-000000000039',  750.00,'2026-04-14','General Fund — 2026-04-14','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000048-0000-0000-0000-000000000048', 1000.00,'2026-04-13','Annual Fund — 2026-04-13','manual'),

-- 8–14 days ago (Apr 6 – Apr 12) -----------------------------
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000001-0000-0000-0000-000000000001', 3500.00,'2026-04-12','Easter Offering — 2026-04-12','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000031-0000-0000-0000-000000000031',  800.00,'2026-04-11','Easter Offering — 2026-04-11','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000037-0000-0000-0000-000000000037', 1500.00,'2026-04-10','General Fund — 2026-04-10','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000006-0000-0000-0000-000000000006',  200.00,'2026-04-09','Monthly Gift — 2026-04-09','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000008-0000-0000-0000-000000000008',  200.00,'2026-04-08','Monthly Gift — 2026-04-08','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000043-0000-0000-0000-000000000043',  650.00,'2026-04-07','General Fund — 2026-04-07','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000003-0000-0000-0000-000000000003', 2000.00,'2026-04-06','Easter Offering — 2026-04-06','manual'),

-- 15–21 days ago (Mar 30 – Apr 5) ----------------------------
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000050-0000-0000-0000-000000000050',  900.00,'2026-04-05','General Fund — 2026-04-05','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000009-0000-0000-0000-000000000009',  100.00,'2026-04-04','Monthly Gift — 2026-04-04','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000017-0000-0000-0000-000000000017',  400.00,'2026-04-03','General Fund — 2026-04-03','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000036-0000-0000-0000-000000000036', 1800.00,'2026-04-02','Annual Fund — 2026-04-02','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000004-0000-0000-0000-000000000004', 2500.00,'2026-04-01','General Fund — 2026-04-01','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000007-0000-0000-0000-000000000007',  500.00,'2026-03-31','General Fund — 2026-03-31','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000046-0000-0000-0000-000000000046', 1100.00,'2026-03-30','General Fund — 2026-03-30','manual'),

-- 22–28 days ago (Mar 23 – Mar 29) ---------------------------
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000005-0000-0000-0000-000000000005',  200.00,'2026-03-28','Monthly Gift — 2026-03-28','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000042-0000-0000-0000-000000000042',  600.00,'2026-03-27','General Fund — 2026-03-27','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000006-0000-0000-0000-000000000006',  200.00,'2026-03-26','Monthly Gift — 2026-03-26','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000002-0000-0000-0000-000000000002', 3000.00,'2026-03-25','Building Fund — 2026-03-25','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000044-0000-0000-0000-000000000044',  450.00,'2026-03-24','General Fund — 2026-03-24','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000008-0000-0000-0000-000000000008',  200.00,'2026-03-23','Monthly Gift — 2026-03-23','manual'),

-- 29–35 days ago (Mar 16 – Mar 22) ---------------------------
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000038-0000-0000-0000-000000000038',  850.00,'2026-03-22','General Fund — 2026-03-22','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000009-0000-0000-0000-000000000009',  100.00,'2026-03-20','Monthly Gift — 2026-03-20','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000049-0000-0000-0000-000000000049',  700.00,'2026-03-19','General Fund — 2026-03-19','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000013-0000-0000-0000-000000000013', 1200.00,'2026-03-18','Annual Fund — 2026-03-18','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000003-0000-0000-0000-000000000003', 4000.00,'2026-03-17','Capital Campaign — 2026-03-17','manual'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000020-0000-0000-0000-000000000020',  350.00,'2026-03-16','General Fund — 2026-03-16','manual');


-- ------------------------------------------------------------
-- 3) Refresh donors.last_donation_date / last_donation_amount
--    so the donor list and "last gift" labels reflect the new
--    recent activity.
-- ------------------------------------------------------------
UPDATE donors dn
SET    last_donation_date   = latest.date,
       last_donation_amount = latest.amount,
       total_lifetime_value = COALESCE(dn.total_lifetime_value, 0) -- untouched; safe default
FROM   (
  SELECT DISTINCT ON (donor_id)
         donor_id, date, amount
  FROM   donations
  WHERE  org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  ORDER  BY donor_id, date DESC
) AS latest
WHERE  dn.id = latest.donor_id
  AND  (dn.last_donation_date IS NULL OR latest.date > dn.last_donation_date);
