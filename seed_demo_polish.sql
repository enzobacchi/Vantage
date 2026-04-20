-- ============================================================
-- DEMO SEED — POLISH PASS (April 2026)
-- org_id: 1aead71c-6bd4-484d-935d-36d6aa2b2f1b   ("Demo Ministry")
--
-- Brings the demo account to "ready for a real ministry user
-- to test alongside Virtuous." Idempotent — safe to re-run.
--
-- Run AFTER seed_demo.sql, seed_demo_v2.sql, seed_demo_recent.sql.
-- Today anchor: 2026-04-19
--
-- Sections:
--   A. Org polish (name, tax_id, website, 501c3 wording)
--   B. Donation options (categories / campaigns / funds)
--      — mirrored into org_donation_options (UI source) AND
--        gift_categories / gift_campaigns / gift_funds (FK targets)
--   C. Backfill donations.category_id / campaign_id / fund_id
--   D. Receipt templates (standard, daf, institutional)
--   E. Pledges (18) + link existing recurring gifts
--   F. Saved reports — populate empty content as CSV; drop junk
--   G. Acknowledgment status (mark ~80% of old gifts sent)
--   H. Interactions (~83 across ~43 donors)
--   I. Donor notes (~35)
--   J. Add 6 organization donors (3 churches, 1 school, 2 corporate)
--   K. Realistic payment_method distribution + payment_type_id link
--   L. Pipeline opportunities (16 total, all stages incl. closed_lost)
--   M. Saved lists (5) + extended tag coverage (146 donor_tags)
--   N. Cleanup junk reports
-- ============================================================

BEGIN;

-- ============================================================
-- A. ORG POLISH
-- ============================================================
UPDATE organizations
SET    name                  = 'Demo Ministry',
       website_url           = 'https://demo-ministry.org',
       tax_id                = '47-3829174',
       legal_501c3_wording   = 'Demo Ministry is a registered 501(c)(3) tax-exempt charitable organization (EIN 47-3829174). Your contribution is tax-deductible to the fullest extent allowed by law. No goods or services were provided in exchange for this gift.',
       fiscal_year_start_month = 1
WHERE  id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b';


-- ============================================================
-- B. DONATION OPTIONS — mirror IDs across the picker table
--    (org_donation_options) and the FK target tables
--    (gift_categories, gift_campaigns, gift_funds).
-- ============================================================
DELETE FROM org_donation_options WHERE org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b';

INSERT INTO org_donation_options (id, org_id, type, name, sort_order) VALUES
('00000001-c000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','category','Tithe', 1),
('00000002-c000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','category','Offering', 2),
('00000003-c000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','category','Missions', 3),
('00000004-c000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','category','Building', 4),
('00000005-c000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','category','Benevolence', 5),
('00000001-a000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','campaign','Easter 2026', 1),
('00000002-a000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','campaign','Spring Appeal 2026', 2),
('00000003-a000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','campaign','Capital Campaign — Sanctuary Renewal', 3),
('00000004-a000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','campaign','Year-End 2025', 4),
('00000005-a000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','campaign','Annual Fund 2026', 5),
('00000001-f000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','fund','General Fund', 1),
('00000002-f000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','fund','Building Fund', 2),
('00000003-f000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','fund','Missions Fund', 3),
('00000004-f000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','fund','Benevolence Fund', 4),
('00000005-f000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','fund','Endowment Fund', 5);

INSERT INTO gift_categories (id, organization_id, name, sort_order, is_active) VALUES
('00000001-c000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Tithe', 1, true),
('00000002-c000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Offering', 2, true),
('00000003-c000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Missions', 3, true),
('00000004-c000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Building', 4, true),
('00000005-c000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Benevolence', 5, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO gift_campaigns (id, organization_id, name, sort_order, is_active) VALUES
('00000001-a000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Easter 2026', 1, true),
('00000002-a000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Spring Appeal 2026', 2, true),
('00000003-a000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Capital Campaign — Sanctuary Renewal', 3, true),
('00000004-a000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Year-End 2025', 4, true),
('00000005-a000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Annual Fund 2026', 5, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO gift_funds (id, organization_id, name, sort_order, is_active) VALUES
('00000001-f000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','General Fund', 1, true),
('00000002-f000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Building Fund', 2, true),
('00000003-f000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Missions Fund', 3, true),
('00000004-f000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Benevolence Fund', 4, true),
('00000005-f000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Endowment Fund', 5, true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- C. BACKFILL donation FKs from memo keywords
-- ============================================================
UPDATE donations SET
  category_id = (CASE
    WHEN memo ILIKE '%Easter%'    THEN '00000002-c000-0000-0000-000000000002'
    WHEN memo ILIKE '%Capital%' OR memo ILIKE '%Building%' THEN '00000004-c000-0000-0000-000000000004'
    WHEN memo ILIKE '%Mission%'   THEN '00000003-c000-0000-0000-000000000003'
    WHEN memo ILIKE '%Monthly%' OR memo ILIKE '%Tithe%' THEN '00000001-c000-0000-0000-000000000001'
    ELSE                                '00000002-c000-0000-0000-000000000002'
  END)::uuid,
  campaign_id = (CASE
    WHEN memo ILIKE '%Easter%'           THEN '00000001-a000-0000-0000-000000000001'
    WHEN memo ILIKE '%Spring%'           THEN '00000002-a000-0000-0000-000000000002'
    WHEN memo ILIKE '%Capital%' OR memo ILIKE '%Building%' THEN '00000003-a000-0000-0000-000000000003'
    WHEN memo ILIKE '%Year-End%' OR memo ILIKE '%Christmas%' THEN '00000004-a000-0000-0000-000000000004'
    WHEN memo ILIKE '%Annual%'           THEN '00000005-a000-0000-0000-000000000005'
    ELSE NULL
  END)::uuid,
  fund_id = (CASE
    WHEN memo ILIKE '%Building%' OR memo ILIKE '%Capital%' OR memo ILIKE '%Sanctuary%' THEN '00000002-f000-0000-0000-000000000002'
    WHEN memo ILIKE '%Mission%'    THEN '00000003-f000-0000-0000-000000000003'
    WHEN memo ILIKE '%Benevolence%' THEN '00000004-f000-0000-0000-000000000004'
    WHEN memo ILIKE '%Endowment%'  THEN '00000005-f000-0000-0000-000000000005'
    ELSE                                '00000001-f000-0000-0000-000000000001'
  END)::uuid
WHERE org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b';


-- ============================================================
-- D. RECEIPT TEMPLATES (one per category — unique constraint)
-- ============================================================
DELETE FROM receipt_templates WHERE org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b';

INSERT INTO receipt_templates (id, org_id, category, name, subject, body, sort_order) VALUES
('00000001-e000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','standard','Standard Donor Receipt',
 'Thank you for your gift to Demo Ministry',
 E'Dear {{first_name}},\n\nThank you for your generous gift of ${{amount}} to Demo Ministry on {{date}}. Your support directly fuels our work serving families across our community.\n\nThis letter serves as your official receipt for tax purposes. Demo Ministry is a registered 501(c)(3) tax-exempt charitable organization (EIN 47-3829174). Your contribution is tax-deductible to the fullest extent allowed by law. No goods or services were provided in exchange for this gift.\n\nWith gratitude,\nPastor Daniel Hayes\nDemo Ministry\nhttps://demo-ministry.org',
 1),
('00000002-e000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','daf','DAF Grant Acknowledgment',
 'Acknowledging your DAF grant to Demo Ministry',
 E'Dear {{first_name}},\n\nThank you for recommending a grant of ${{amount}} from your donor-advised fund to Demo Ministry. We received the distribution on {{date}} and have applied it to our general operating fund.\n\nThis acknowledgment is for your records and your DAF sponsor. As required by IRS rules, no goods or services were provided in exchange for this grant.\n\nDemo Ministry is a registered 501(c)(3) tax-exempt charitable organization (EIN 47-3829174).\n\nWith gratitude,\nPastor Daniel Hayes\nDemo Ministry',
 2),
('00000003-e000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','institutional','Foundation / Corporate Acknowledgment',
 'Receipt of your contribution to Demo Ministry',
 E'Dear {{first_name}},\n\nOn behalf of the board and staff of Demo Ministry, thank you for your contribution of ${{amount}} received on {{date}}. We are grateful for your partnership.\n\nA full impact report will follow at year-end. In the meantime, please retain this letter for your records. Demo Ministry is a registered 501(c)(3) tax-exempt charitable organization (EIN 47-3829174). No goods or services were provided in exchange for this gift.\n\nSincerely,\nPastor Daniel Hayes\nExecutive Director, Demo Ministry',
 3);


-- ============================================================
-- E. PLEDGES
-- ============================================================
DELETE FROM pledges WHERE org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b';

INSERT INTO pledges (id, org_id, donor_id, amount, frequency, start_date, end_date, status, notes) VALUES
('00000001-b000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000005-0000-0000-0000-000000000005'::uuid, 200.00, 'monthly', '2024-01-01', NULL, 'active', 'Monthly tithe via ACH. Set up at New Year vision Sunday.'),
('00000002-b000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000006-0000-0000-0000-000000000006'::uuid, 200.00, 'monthly', '2024-03-01', NULL, 'active', 'Recurring monthly gift, prefers no contact between annual reviews.'),
('00000003-b000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000008-0000-0000-0000-000000000008'::uuid, 200.00, 'monthly', '2024-02-01', NULL, 'active', 'Monthly partner since launch of Building Hope campaign.'),
('00000004-b000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000009-0000-0000-0000-000000000009'::uuid, 100.00, 'monthly', '2024-05-01', NULL, 'active', 'Smaller monthly gift; appreciates handwritten notes.'),
('00000005-b000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000033-0000-0000-0000-000000000033'::uuid, 250.00, 'monthly', '2025-01-15', NULL, 'active', 'Tech executive, set up auto-pay after Q1 2025 lunch.'),
('00000006-b000-0000-0000-000000000006'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000045-0000-0000-0000-000000000045'::uuid, 150.00, 'monthly', '2025-06-01', NULL, 'active', 'Started after Spring Appeal 2025.'),
('00000007-b000-0000-0000-000000000007'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000011-0000-0000-0000-000000000011'::uuid, 75.00, 'monthly', '2025-09-01', NULL, 'active', 'New monthly partner from Easter 2025 follow-up.'),
('00000008-b000-0000-0000-000000000008'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000037-0000-0000-0000-000000000037'::uuid, 100.00, 'monthly', '2025-04-01', NULL, 'active', 'Monthly partner — interested in missions specifically.'),
('00000009-b000-0000-0000-000000000009'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000048-0000-0000-0000-000000000048'::uuid, 125.00, 'monthly', '2025-08-15', NULL, 'active', 'Auto-pay enrollment via online giving form.'),
('0000000a-b000-0000-0000-00000000000a'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000050-0000-0000-0000-000000000050'::uuid, 150.00, 'monthly', '2024-11-01', NULL, 'active', 'Year-End 2024 monthly conversion.'),
('0000000b-b000-0000-0000-00000000000b'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000043-0000-0000-0000-000000000043'::uuid, 200.00, 'monthly', '2025-02-01', NULL, 'active', 'New family — joined after Vision Weekend.'),
('0000000c-b000-0000-0000-00000000000c'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000039-0000-0000-0000-000000000039'::uuid,  50.00, 'monthly', '2025-10-01', NULL, 'active', 'Small but steady. Retired teacher.'),
('0000000d-b000-0000-0000-00000000000d'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000004-0000-0000-0000-000000000004'::uuid, 1500.00, 'quarterly', '2025-01-01', '2026-12-31', 'active', 'Quarterly stewardship gift toward Building Fund.'),
('0000000e-b000-0000-0000-00000000000e'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000034-0000-0000-0000-000000000034'::uuid, 1000.00, 'quarterly', '2025-04-01', '2027-03-31', 'active', 'Quarterly DAF distribution from Reyes Family Charitable Account.'),
('0000000f-b000-0000-0000-00000000000f'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000031-0000-0000-0000-000000000031'::uuid,  750.00, 'quarterly', '2025-01-01', NULL, 'active', 'Open-ended quarterly pledge.'),
('00000010-b000-0000-0000-000000000010'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000076-0000-0000-0000-000000000076'::uuid, 1200.00, 'quarterly', '2023-06-01', '2025-05-31', 'fulfilled', 'Two-year quarterly pledge — completed.'),
('00000011-b000-0000-0000-000000000011'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000001-0000-0000-0000-000000000001'::uuid, 10000.00, 'annual', '2024-12-15', NULL, 'active', 'Annual leadership gift, payable each December.'),
('00000012-b000-0000-0000-000000000012'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000002-0000-0000-0000-000000000002'::uuid, 15000.00, 'annual', '2025-01-15', NULL, 'active', 'Annual major gift toward Capital Campaign.');

UPDATE donations d
SET    pledge_id = p.id
FROM   pledges p
WHERE  p.org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND  p.frequency = 'monthly'
  AND  d.donor_id = p.donor_id
  AND  d.org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND  d.memo ILIKE '%Monthly%'
  AND  d.date >= p.start_date;


-- ============================================================
-- N. CLEANUP junk reports (do this before F so we don't backfill them)
-- ============================================================
DELETE FROM saved_reports
WHERE  organization_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND  (title = 'Test'
        OR title ILIKE 'nashville — 4 stops'
        OR title = 'Map selection - 3/19/2026');


-- ============================================================
-- F. SAVED REPORTS — populate content with real CSV
-- ============================================================
UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Lifetime Value,Last Gift Date,City,State' || E'\n' ||
         string_agg(
           COALESCE(display_name,'') || ',' || COALESCE(email,'') || ',' || COALESCE(phone,'') || ',$' ||
           COALESCE(total_lifetime_value::text,'0') || ',' || COALESCE(last_donation_date::text,'') || ',' ||
           COALESCE(city,'') || ',' || COALESCE(state,''),
           E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND total_lifetime_value >= 1000
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND total_lifetime_value >= 1000)
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Major Donors ($1,000+)';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Last Gift Date,Lifetime Value,City,State' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(last_donation_date::text,'')||',$'||COALESCE(total_lifetime_value::text,'0')||','||
                    COALESCE(city,'')||','||COALESCE(state,''),
                    E'\n' ORDER BY last_donation_date DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND last_donation_date < CURRENT_DATE - INTERVAL '12 months'
    AND last_donation_date >= CURRENT_DATE - INTERVAL '24 months'
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND last_donation_date < CURRENT_DATE - INTERVAL '12 months'
    AND last_donation_date >= CURRENT_DATE - INTERVAL '24 months')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Lapsed Donor Outreach List';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Last Gift Date,Lifetime Value,City,State' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(last_donation_date::text,'')||',$'||COALESCE(total_lifetime_value::text,'0')||','||
                    COALESCE(city,'')||','||COALESCE(state,''),
                    E'\n' ORDER BY last_donation_date DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND last_donation_date < CURRENT_DATE - INTERVAL '24 months'
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND last_donation_date < CURRENT_DATE - INTERVAL '24 months')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Lost Donors (2+ Years Lapsed)';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Last Gift Date,Lifetime Value,City,State' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(last_donation_date::text,'')||',$'||COALESCE(total_lifetime_value::text,'0')||','||
                    COALESCE(city,'')||','||COALESCE(state,''),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND last_donation_date < CURRENT_DATE - INTERVAL '12 months' AND total_lifetime_value >= 500
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND last_donation_date < CURRENT_DATE - INTERVAL '12 months' AND total_lifetime_value >= 500)
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='High-Value Lapsed ($500+)';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,City,State,Lifetime Value,Last Gift Date' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(city,'')||','||COALESCE(state,'')||',$'||
                    COALESCE(total_lifetime_value::text,'0')||','||COALESCE(last_donation_date::text,''),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND state='TN'
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND state='TN')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title IN ('TN donors','Tennessee Donors');

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,City,State,Lifetime Value' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(city,'')||','||COALESCE(state,'')||',$'||COALESCE(total_lifetime_value::text,'0'),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND state IN ('TN','GA','FL','SC','NC','AL','MS','LA','AR','KY','VA','WV')
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND state IN ('TN','GA','FL','SC','NC','AL','MS','LA','AR','KY','VA','WV'))
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Southeast Region';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,City,State,Lifetime Value' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(city,'')||','||COALESCE(state,'')||',$'||COALESCE(total_lifetime_value::text,'0'),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND state IN ('OH','IN','IL','MI','WI','MN','IA','MO','KS','NE','SD','ND')
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND state IN ('OH','IN','IL','MI','WI','MN','IA','MO','KS','NE','SD','ND'))
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Midwest & Great Plains';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,City,State,Lifetime Value' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(city,'')||','||COALESCE(state,'')||',$'||COALESCE(total_lifetime_value::text,'0'),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND state IN ('NY','NJ','PA','CT','MA','RI','VT','NH','ME','MD','DE','DC')
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND state IN ('NY','NJ','PA','CT','MA','RI','VT','NH','ME','MD','DE','DC'))
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Northeast Corridor';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,City,State,Lifetime Value' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||','||
                    COALESCE(city,'')||','||COALESCE(state,'')||',$'||COALESCE(total_lifetime_value::text,'0'),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND state IN ('CA','OR','WA','HI','AK')
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND state IN ('CA','OR','WA','HI','AK'))
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Pacific Coast Donors';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Monthly Amount,Pledge Start' || E'\n' ||
         string_agg(COALESCE(d.display_name,'')||','||COALESCE(d.email,'')||','||COALESCE(d.phone,'')||',$'||
                    COALESCE(p.amount::text,'0')||','||COALESCE(p.start_date::text,''),
                    E'\n' ORDER BY p.amount DESC)
  FROM donors d JOIN pledges p ON p.donor_id=d.id
  WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND p.frequency='monthly' AND p.status='active'
), records_count = (SELECT COUNT(*) FROM pledges p WHERE p.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND p.frequency='monthly' AND p.status='active')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Monthly Giving Program';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Lifetime Value,Last Gift Date' || E'\n' ||
         string_agg(COALESCE(d.display_name,'')||','||COALESCE(d.email,'')||','||COALESCE(d.phone,'')||',$'||
                    COALESCE(d.total_lifetime_value::text,'0')||','||COALESCE(d.last_donation_date::text,''),
                    E'\n' ORDER BY d.total_lifetime_value DESC NULLS LAST)
  FROM donors d JOIN donor_tags dt ON dt.donor_id=d.id JOIN tags t ON t.id=dt.tag_id
  WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND t.name='Board Member'
), records_count = (SELECT COUNT(*) FROM donor_tags dt JOIN tags t ON t.id=dt.tag_id
  WHERE t.organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND t.name='Board Member')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Board Member Giving Summary';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Lifetime Value,Last Gift Date,City,State' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||',$'||
                    COALESCE(total_lifetime_value::text,'0')||','||COALESCE(last_donation_date::text,'')||','||
                    COALESCE(city,'')||','||COALESCE(state,''),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND total_lifetime_value >= 2500 AND last_donation_date >= '2024-06-01'
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND total_lifetime_value >= 2500 AND last_donation_date >= '2024-06-01')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Capital Campaign Prospects';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Lifetime Value,City,State' || E'\n' ||
         string_agg(COALESCE(display_name,'')||','||COALESCE(email,'')||','||COALESCE(phone,'')||',$'||
                    COALESCE(total_lifetime_value::text,'0')||','||COALESCE(city,'')||','||COALESCE(state,''),
                    E'\n' ORDER BY total_lifetime_value DESC NULLS LAST)
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND total_lifetime_value >= 5000 AND last_donation_date >= '2023-01-01'
), records_count = (SELECT COUNT(*) FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND total_lifetime_value >= 5000 AND last_donation_date >= '2023-01-01')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Legacy Giving Prospects';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Phone,Last Gift Date,Lifetime Value' || E'\n' ||
         string_agg(COALESCE(d.display_name,'')||','||COALESCE(d.email,'')||','||COALESCE(d.phone,'')||','||
                    COALESCE(d.last_donation_date::text,'')||',$'||COALESCE(d.total_lifetime_value::text,'0'),
                    E'\n' ORDER BY d.total_lifetime_value DESC NULLS LAST)
  FROM donors d
  WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND EXISTS (SELECT 1 FROM donations dn WHERE dn.donor_id=d.id AND dn.date BETWEEN '2024-01-01' AND '2024-12-31')
    AND NOT EXISTS (SELECT 1 FROM donations dn WHERE dn.donor_id=d.id AND dn.date >= '2025-01-01')
), records_count = (SELECT COUNT(*) FROM donors d WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND EXISTS (SELECT 1 FROM donations dn WHERE dn.donor_id=d.id AND dn.date BETWEEN '2024-01-01' AND '2024-12-31')
    AND NOT EXISTS (SELECT 1 FROM donations dn WHERE dn.donor_id=d.id AND dn.date >= '2025-01-01'))
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='LYBUNT Report (2024)';

-- 2025 Annual Fund (uses subquery to avoid nested aggregates)
UPDATE saved_reports sr SET content = sub.csv, records_count = sub.cnt
FROM (
  SELECT 'Display Name,Email,Total 2025 Giving,Gift Count' || E'\n' || string_agg(line, E'\n' ORDER BY total DESC) AS csv,
         COUNT(*) AS cnt
  FROM (
    SELECT d.display_name, d.email, SUM(dn.amount) AS total, COUNT(dn.id) AS cnt,
           COALESCE(d.display_name,'')||','||COALESCE(d.email,'')||',$'||SUM(dn.amount)::text||','||COUNT(dn.id)::text AS line
    FROM donors d JOIN donations dn ON dn.donor_id=d.id
    WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND dn.date BETWEEN '2025-01-01' AND '2025-12-31'
    GROUP BY d.id, d.display_name, d.email
  ) x
) sub
WHERE sr.organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND sr.title='2025 Annual Fund Donors';

UPDATE saved_reports sr SET content = sub.csv, records_count = sub.cnt
FROM (
  SELECT 'Display Name,Email,Q4 Total,Gift Count' || E'\n' || string_agg(line, E'\n' ORDER BY total DESC) AS csv,
         COUNT(*) AS cnt
  FROM (
    SELECT d.display_name, d.email, SUM(dn.amount) AS total, COUNT(dn.id) AS cnt,
           COALESCE(d.display_name,'')||','||COALESCE(d.email,'')||',$'||SUM(dn.amount)::text||','||COUNT(dn.id)::text AS line
    FROM donors d JOIN donations dn ON dn.donor_id=d.id
    WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND dn.date BETWEEN '2025-10-01' AND '2025-12-31'
    GROUP BY d.id, d.display_name, d.email
  ) x
) sub
WHERE sr.organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND sr.title='Q4 2025 Giving Report';

UPDATE saved_reports SET content = (
  SELECT 'Display Name,Email,Year-End 2025 Gift,Gift Date' || E'\n' ||
         string_agg(COALESCE(d.display_name,'')||','||COALESCE(d.email,'')||',$'||
                    COALESCE(dn.amount::text,'0')||','||COALESCE(dn.date::text,''),
                    E'\n' ORDER BY dn.amount DESC)
  FROM donors d JOIN donations dn ON dn.donor_id=d.id
  WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND dn.date BETWEEN '2025-11-15' AND '2025-12-31'
), records_count = (SELECT COUNT(*) FROM donations dn JOIN donors d ON d.id=dn.donor_id
  WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND dn.date BETWEEN '2025-11-15' AND '2025-12-31')
WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND title='Year-End Campaign Results 2025';


-- ============================================================
-- G. ACKNOWLEDGMENTS — mark ~85% of gifts older than 14 days as sent
-- ============================================================
UPDATE donations
SET    acknowledgment_status = 'sent',
       acknowledgment_sent_at = (date::timestamptz + INTERVAL '5 days' + (floor(random()*7)::text||' days')::interval)
WHERE  org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND  date < CURRENT_DATE - INTERVAL '14 days'
  AND  acknowledgment_status <> 'sent'
  AND  random() < 0.85;


-- ============================================================
-- J. NEW ORG DONORS (3 churches, 1 school, 2 corporate)
-- ============================================================
INSERT INTO donors (id, org_id, display_name, first_name, last_name, donor_type, email, phone,
                    billing_address, city, state, zip, location_lat, location_lng,
                    total_lifetime_value, last_donation_date, last_donation_amount, acquisition_source) VALUES
('d0000201-0000-0000-0000-000000000201'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Grace Community Church',NULL,'Grace Community Church','church','giving@gracecommunity.org','(615) 555-0301',
 '4500 Hillsboro Pike','Nashville','TN','37215',36.1067,-86.8167,12500.00,'2026-03-29',5000.00,'partner_church'),
('d0000202-0000-0000-0000-000000000202'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','First Baptist Franklin',NULL,'First Baptist Franklin','church','office@firstbaptistfranklin.org','(615) 555-0302',
 '108 5th Ave S','Franklin','TN','37064',35.9251,-86.8689, 8000.00,'2025-12-15',3500.00,'partner_church'),
('d0000203-0000-0000-0000-000000000203'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Riverside Fellowship',NULL,'Riverside Fellowship','church','admin@riversidefellowship.org','(615) 555-0303',
 '622 Bell Rd','Antioch','TN','37013',36.0586,-86.6708,4500.00,'2026-02-08',2000.00,'partner_church'),
('d0000204-0000-0000-0000-000000000204'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Briarwood Christian School',NULL,'Briarwood Christian School','school','development@briarwoodchristian.edu','(205) 555-0304',
 '6255 Cahaba Valley Rd','Birmingham','AL','35242',33.4019,-86.7728,6000.00,'2025-11-12',2500.00,'partnership'),
('d0000205-0000-0000-0000-000000000205'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Hayes Family Foundation',NULL,'Hayes Family Foundation','corporate','grants@hayesfoundation.org','(615) 555-0305',
 'PO Box 410','Brentwood','TN','37024',36.0331,-86.7828,15000.00,'2025-12-22',7500.00,'foundation_grant'),
('d0000206-0000-0000-0000-000000000206'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Cumberland Properties LLC',NULL,'Cumberland Properties LLC','corporate','jthomas@cumberlandprop.com','(615) 555-0306',
 '424 Church St Suite 200','Nashville','TN','37219',36.1627,-86.7816, 3500.00,'2026-01-28',1500.00,'business_partner')
ON CONFLICT (id) DO NOTHING;

-- Realistic gift histories for the new org donors
INSERT INTO donations (id, org_id, donor_id, amount, date, memo, source, gift_type, payment_method,
                       category_id, fund_id, campaign_id) VALUES
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000201-0000-0000-0000-000000000201'::uuid,5000,'2026-03-29','Quarterly partnership gift','manual','Gift','ach',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000201-0000-0000-0000-000000000201'::uuid,3500,'2025-12-22','Year-end partnership gift','manual','Gift','ach',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,'00000004-a000-0000-0000-000000000004'::uuid),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000201-0000-0000-0000-000000000201'::uuid,4000,'2025-09-15','Q3 partnership','manual','Gift','ach',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000202-0000-0000-0000-000000000202'::uuid,3500,'2025-12-15','Year-end partnership','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,'00000004-a000-0000-0000-000000000004'::uuid),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000202-0000-0000-0000-000000000202'::uuid,2500,'2025-06-12','Mid-year missions support','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000202-0000-0000-0000-000000000202'::uuid,2000,'2024-12-20','Year-end gift','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000203-0000-0000-0000-000000000203'::uuid,2000,'2026-02-08','Easter outreach support','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000203-0000-0000-0000-000000000203'::uuid,1500,'2025-08-30','Summer ministry','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000203-0000-0000-0000-000000000203'::uuid,1000,'2024-11-10','Year-end','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000204-0000-0000-0000-000000000204'::uuid,2500,'2025-11-12','Mission partnership','manual','Gift','ach',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000003-f000-0000-0000-000000000003'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000204-0000-0000-0000-000000000204'::uuid,2000,'2025-04-22','Spring chapel offering','manual','Gift','check',
  '00000002-c000-0000-0000-000000000002'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000204-0000-0000-0000-000000000204'::uuid,1500,'2024-10-30','Fall partnership','manual','Gift','check',
  '00000003-c000-0000-0000-000000000003'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000205-0000-0000-0000-000000000205'::uuid,7500,'2025-12-22','Capital campaign foundation grant','manual','Gift','ach',
  '00000004-c000-0000-0000-000000000004'::uuid,'00000002-f000-0000-0000-000000000002'::uuid,'00000003-a000-0000-0000-000000000003'::uuid),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000205-0000-0000-0000-000000000205'::uuid,5000,'2025-06-15','Operating support grant','manual','Gift','ach',
  '00000002-c000-0000-0000-000000000002'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000205-0000-0000-0000-000000000205'::uuid,2500,'2024-12-18','Year-end grant','manual','Gift','ach',
  '00000002-c000-0000-0000-000000000002'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,'00000004-a000-0000-0000-000000000004'::uuid),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000206-0000-0000-0000-000000000206'::uuid,1500,'2026-01-28','Corporate sponsorship','manual','Gift','ach',
  '00000002-c000-0000-0000-000000000002'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000206-0000-0000-0000-000000000206'::uuid,1200,'2025-08-15','Mid-year sponsorship','manual','Gift','ach',
  '00000002-c000-0000-0000-000000000002'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,NULL),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000206-0000-0000-0000-000000000206'::uuid, 800,'2024-12-10','Year-end gift','manual','Gift','ach',
  '00000002-c000-0000-0000-000000000002'::uuid,'00000001-f000-0000-0000-000000000001'::uuid,'00000004-a000-0000-0000-000000000004'::uuid);

UPDATE donations SET acknowledgment_status='sent', acknowledgment_sent_at=date::timestamptz + INTERVAL '5 days'
WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND donor_id IN ('d0000201-0000-0000-0000-000000000201','d0000202-0000-0000-0000-000000000202','d0000203-0000-0000-0000-000000000203',
                   'd0000204-0000-0000-0000-000000000204','d0000205-0000-0000-0000-000000000205','d0000206-0000-0000-0000-000000000206')
  AND date < CURRENT_DATE - INTERVAL '14 days'
  AND acknowledgment_status <> 'sent';


-- ============================================================
-- K. PAYMENT METHODS — realistic distribution
-- ============================================================
UPDATE donations
SET    payment_method = (CASE
  WHEN r < 0.40 THEN 'credit_card'
  WHEN r < 0.65 THEN 'ach'
  WHEN r < 0.80 THEN 'check'
  WHEN r < 0.90 THEN 'cash'
  WHEN r < 0.95 THEN 'paypal'
  WHEN r < 0.98 THEN 'venmo'
  ELSE                'other'
END)
FROM (SELECT id, random() AS r FROM donations WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b') src
WHERE donations.id = src.id;

UPDATE donations d
SET    payment_type_id = pt.id
FROM   payment_types pt
WHERE  d.org_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND  pt.organization_id = '1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND  ((d.payment_method = 'credit_card' AND pt.name = 'Credit Card')
     OR (d.payment_method = 'ach'         AND pt.name = 'ACH/Bank Transfer')
     OR (d.payment_method = 'check'       AND pt.name = 'Check')
     OR (d.payment_method = 'cash'        AND pt.name = 'Cash')
     OR (d.payment_method = 'paypal'      AND pt.name = 'PayPal')
     OR (d.payment_method = 'venmo'       AND pt.name = 'Venmo')
     OR (d.payment_method = 'other'       AND pt.name = 'Other'));


-- ============================================================
-- L. PIPELINE — bring opportunities to ~14, all stages
-- ============================================================
INSERT INTO opportunities (id, organization_id, donor_id, title, amount, status, expected_date) VALUES
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000003-0000-0000-0000-000000000003','Major Gift — Stephanie Miller', 7500, 'identified', '2026-06-30'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000033-0000-0000-0000-000000000033','Tech Sector Partnership',         5000, 'identified', '2026-07-15'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000004-0000-0000-0000-000000000004','David & Linda Thompson — Q3 Ask', 6000, 'qualified',  '2026-08-01'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000201-0000-0000-0000-000000000201','Grace Community Church Renewal',  8000, 'qualified',  '2026-06-15'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000045-0000-0000-0000-000000000045','Park Family — Capital Pledge Ask',12000, 'solicited', '2026-05-30'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000205-0000-0000-0000-000000000205','Hayes Foundation 2026 Grant',    10000, 'solicited', '2026-06-01'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000005-0000-0000-0000-000000000005','James Wilson — Major Gift Pledge',4000, 'committed', '2026-05-15'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000037-0000-0000-0000-000000000037','Patterson — Missions Commitment', 3500, 'committed', '2026-05-22'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000034-0000-0000-0000-000000000034','Reyes DAF Distribution',          4000, 'closed_won', '2026-04-15'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000079-0000-0000-0000-000000000079','Stone Family — declined ask',     5000, 'closed_lost','2026-02-10'),
(gen_random_uuid(),'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','d0000204-0000-0000-0000-000000000204','Briarwood — passed for 2026',     3000, 'closed_lost','2026-03-22');


-- ============================================================
-- M. SAVED LISTS + extended tag coverage
-- ============================================================
INSERT INTO saved_lists (id, organization_id, name, icon, filters) VALUES
('00000001-7000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Top 25 Donors','star',
 '{"filters":[{"field":"total_lifetime_value","operator":">=","value":1500}],"sort":"total_lifetime_value:desc","limit":25}'::jsonb),
('00000002-7000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Lapsed Major Donors','alert-triangle',
 '{"filters":[{"field":"total_lifetime_value","operator":">=","value":1000},{"field":"last_donation_date","operator":"<","value":"2025-04-20"}]}'::jsonb),
('00000003-7000-0000-0000-000000000003'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Tennessee Volunteers','map-pin',
 '{"filters":[{"field":"state","operator":"=","value":"TN"},{"field":"tag","operator":"=","value":"Volunteer"}]}'::jsonb),
('00000004-7000-0000-0000-000000000004'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Active Monthly Partners','repeat',
 '{"filters":[{"field":"pledge.frequency","operator":"=","value":"monthly"},{"field":"pledge.status","operator":"=","value":"active"}]}'::jsonb),
('00000005-7000-0000-0000-000000000005'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Capital Campaign Prospects','building',
 '{"filters":[{"field":"total_lifetime_value","operator":">=","value":2500},{"field":"last_donation_date","operator":">=","value":"2024-06-01"}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tags (id, organization_id, name, color) VALUES
('00000001-8000-0000-0000-000000000001'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Capital Campaign Prospect','purple'),
('00000002-8000-0000-0000-000000000002'::uuid,'1aead71c-6bd4-484d-935d-36d6aa2b2f1b','Legacy Society','amber')
ON CONFLICT (id) DO NOTHING;

-- Wipe-and-rebuild auto-tagging for predictable counts
DELETE FROM donor_tags WHERE tag_id IN (
  SELECT id FROM tags WHERE organization_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
    AND name IN ('Major Donor','Monthly Donor','Capital Campaign Prospect','Legacy Society','First-Time Donor')
);

INSERT INTO donor_tags (donor_id, tag_id)
SELECT d.id, t.id FROM donors d, tags t
WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND t.organization_id=d.org_id
  AND t.name='Major Donor' AND d.total_lifetime_value >= 1000
ON CONFLICT DO NOTHING;

INSERT INTO donor_tags (donor_id, tag_id)
SELECT DISTINCT p.donor_id, t.id FROM pledges p, tags t
WHERE p.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND t.organization_id=p.org_id
  AND p.frequency='monthly' AND p.status='active' AND t.name='Monthly Donor'
ON CONFLICT DO NOTHING;

INSERT INTO donor_tags (donor_id, tag_id)
SELECT d.id, t.id FROM donors d, tags t
WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' AND t.organization_id=d.org_id
  AND t.name='Capital Campaign Prospect'
  AND d.total_lifetime_value >= 2500 AND d.last_donation_date >= '2024-06-01'
ON CONFLICT DO NOTHING;

INSERT INTO donor_tags (donor_id, tag_id)
SELECT d.id, t.id
FROM donors d
JOIN (SELECT donor_id, MIN(date) AS first_date FROM donations
      WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' GROUP BY donor_id) firsts ON firsts.donor_id = d.id
JOIN tags t ON t.organization_id=d.org_id AND t.name='Legacy Society'
WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND firsts.first_date < '2024-01-01' AND d.total_lifetime_value >= 3000
ON CONFLICT DO NOTHING;

INSERT INTO donor_tags (donor_id, tag_id)
SELECT d.id, t.id
FROM donors d
JOIN (SELECT donor_id, COUNT(*) AS n, MIN(date) AS first_date FROM donations
      WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b' GROUP BY donor_id) stats ON stats.donor_id = d.id
JOIN tags t ON t.organization_id=d.org_id AND t.name='First-Time Donor'
WHERE d.org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  AND stats.n = 1 AND stats.first_date >= CURRENT_DATE - INTERVAL '12 months'
ON CONFLICT DO NOTHING;


-- ============================================================
-- H. INTERACTIONS — ~80 across top 40 donors
-- ============================================================
WITH targets AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY total_lifetime_value DESC NULLS LAST) AS rn
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  ORDER BY total_lifetime_value DESC NULLS LAST LIMIT 40
)
INSERT INTO interactions (donor_id, type, direction, subject, content, date, status)
SELECT t.id,
  CASE (t.rn % 5) WHEN 0 THEN 'call' WHEN 1 THEN 'email' WHEN 2 THEN 'meeting' WHEN 3 THEN 'task' ELSE 'note' END,
  CASE WHEN t.rn % 3 = 0 THEN 'inbound' ELSE 'outbound' END,
  CASE (t.rn % 6)
    WHEN 0 THEN 'Quarterly check-in call'
    WHEN 1 THEN 'Thank-you email — recent gift'
    WHEN 2 THEN 'Coffee meeting at the office'
    WHEN 3 THEN 'Send year-end giving statement'
    WHEN 4 THEN 'Inbound: question about year-end giving'
    ELSE 'Annual stewardship visit'
  END,
  CASE (t.rn % 6)
    WHEN 0 THEN 'Caught up on family — daughter starting at Vanderbilt in fall. Indicated openness to a larger gift toward the Capital Campaign. Follow up in 60 days.'
    WHEN 1 THEN 'Sent a personal thank-you note acknowledging their recent gift. Included a quick update on the building project.'
    WHEN 2 THEN 'Met for coffee at Crema downtown. Reviewed last year''s giving, discussed missions opportunities. Invited to spring vision dinner.'
    WHEN 3 THEN 'Generate and send 2025 year-end giving statement before Jan 31. Confirm address on file is current.'
    WHEN 4 THEN 'Donor emailed asking about a stock transfer. Sent broker info and the form. Awaiting confirmation.'
    ELSE 'Annual visit at their home — discussed estate giving plans. They mentioned including the ministry in their will.'
  END,
  (CURRENT_DATE - ((t.rn * 4)||' days')::interval)::timestamptz,
  CASE WHEN t.rn % 7 = 0 THEN 'pending' ELSE 'completed' END
FROM targets t;

WITH targets AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY total_lifetime_value DESC NULLS LAST) AS rn
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  ORDER BY total_lifetime_value DESC NULLS LAST LIMIT 30
)
INSERT INTO interactions (donor_id, type, direction, subject, content, date, status)
SELECT t.id,
  CASE WHEN t.rn % 2 = 0 THEN 'email' ELSE 'call' END,
  'outbound',
  CASE WHEN t.rn % 2 = 0 THEN 'Easter service invite' ELSE 'Vision Sunday RSVP follow-up' END,
  CASE WHEN t.rn % 2 = 0 THEN 'Sent personalized Easter service invite, included parking + childcare info.'
       ELSE 'Left voicemail re: Vision Sunday. Will retry next Tuesday.' END,
  (CURRENT_DATE - ((t.rn * 6 + 7)||' days')::interval)::timestamptz,
  CASE WHEN t.rn % 4 = 0 THEN 'pending' ELSE 'completed' END
FROM targets t;


-- ============================================================
-- I. NOTES — ~30 substantive notes on top donors
-- ============================================================
WITH targets AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY total_lifetime_value DESC NULLS LAST) AS rn
  FROM donors WHERE org_id='1aead71c-6bd4-484d-935d-36d6aa2b2f1b'
  ORDER BY total_lifetime_value DESC NULLS LAST LIMIT 30
)
INSERT INTO donor_notes (donor_id, note)
SELECT t.id,
  CASE (t.rn % 8)
    WHEN 0 THEN 'Prefers handwritten thank-you notes over email. Birthday in October. Wife''s name is in display name.'
    WHEN 1 THEN 'Tech executive — prefers email contact. Auto-pay is enabled; do not call about lapsed payments unless a charge fails.'
    WHEN 2 THEN 'Asked to be removed from monthly newsletter but keep on year-end appeal list. Updated preferences in March 2026.'
    WHEN 3 THEN 'Originally connected through Pastor Daniel''s small group in 2023. Strong relationship. Owns a dental practice.'
    WHEN 4 THEN 'Spouse passed away in late 2024. Be thoughtful about anniversary date (Nov 12). Continued giving but reduced amount.'
    WHEN 5 THEN 'Snowbird — splits time between TN and FL. Mailing address differs from billing in winter months.'
    WHEN 6 THEN 'Member of finance committee. Knows our 990 inside out — appreciates transparent communication on overhead ratio.'
    ELSE         'Interested in funded missions specifically — Honduras team. Less responsive to general operating asks.'
  END
FROM targets t
WHERE NOT EXISTS (SELECT 1 FROM donor_notes n WHERE n.donor_id = t.id);

COMMIT;
