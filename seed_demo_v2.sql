-- ============================================================
-- DEMO SEED v2 — Extends seed_demo.sql
-- org_id: 1aead71c-6bd4-484d-935d-36d6aa2b2f1b
--
-- Adds:
--   • 70 donors spread across the US  (d0000031 – d0000100)
--   • Donations for each new donor
--   • 4 report folders
--   • 16 saved reports across those folders
--
-- Run AFTER seed_demo.sql. Safe to re-run.
-- ============================================================


-- -------------------------------------------------------
-- DONORS — 70 new (d0000031 – d0000100)
--   Active: 031–055, 086–100
--   New:    056–065
--   Lapsed: 066–075
--   Lost:   076–085
-- -------------------------------------------------------
INSERT INTO donors (
  id, org_id,
  display_name, first_name, last_name,
  email, phone, billing_address, city, state, zip,
  location_lat, location_lng,
  total_lifetime_value, last_donation_date
) VALUES

-- ── ACTIVE DONORS ─────────────────────────────────────

('d0000031-0000-0000-0000-000000000031','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Margaret & Thomas O''Brien','Margaret','O''Brien',
 'mobrien@email.com','(503) 555-0131','2214 NW Hoyt St','Portland','OR','97210',
 45.5244,-122.6992, 3500.00,'2026-01-10'),

('d0000032-0000-0000-0000-000000000032','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'David Kim','David','Kim',
 'dkim@email.com','(206) 555-0132','1408 E Pike St','Seattle','WA','98122',
 47.6145,-122.3156, 2800.00,'2025-12-22'),

('d0000033-0000-0000-0000-000000000033','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Grace Chen','Grace','Chen',
 'grace.chen@email.com','(415) 555-0133','3210 Sacramento St','San Francisco','CA','94115',
 37.7876,-122.4484, 4200.00,'2026-01-28'),

('d0000034-0000-0000-0000-000000000034','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Carlos & Maria Reyes','Carlos','Reyes',
 'creyes@email.com','(323) 555-0134','1820 W Olympic Blvd','Los Angeles','CA','90006',
 34.0494,-118.2916, 6500.00,'2025-11-18'),

('d0000035-0000-0000-0000-000000000035','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Sandra Wheeler','Sandra','Wheeler',
 'swheeler@email.com','(602) 555-0135','4802 E Camelback Rd','Phoenix','AZ','85018',
 33.5089,-111.9934, 1800.00,'2025-10-14'),

('d0000036-0000-0000-0000-000000000036','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Craig & Susan Hoffman','Craig','Hoffman',
 'choffman@email.com','(720) 555-0136','755 S Pearl St','Denver','CO','80209',
 39.7147,-104.9833, 3200.00,'2026-02-01'),

('d0000037-0000-0000-0000-000000000037','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Frank & Deborah Patterson','Frank','Patterson',
 'fpatterson@email.com','(214) 555-0137','4400 Mockingbird Ln','Dallas','TX','75205',
 32.8401,-96.7873, 5500.00,'2025-12-08'),

('d0000038-0000-0000-0000-000000000038','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Marcus Williams','Marcus','Williams',
 'mwilliams@email.com','(713) 555-0138','2500 Westheimer Rd','Houston','TX','77098',
 29.7420,-95.4195, 2200.00,'2025-11-05'),

('d0000039-0000-0000-0000-000000000039','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Patricia O''Connor','Patricia','O''Connor',
 'poconnor@email.com','(312) 555-0139','1630 N Wells St','Chicago','IL','60614',
 41.9128,-87.6348, 3800.00,'2026-01-15'),

('d0000040-0000-0000-0000-000000000040','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Erik Larsen','Erik','Larsen',
 'elarsen@email.com','(612) 555-0140','4820 Upton Ave S','Minneapolis','MN','55410',
 44.9270,-93.3299, 1500.00,'2025-09-19'),

('d0000041-0000-0000-0000-000000000041','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Dorothy Harrison','Dorothy','Harrison',
 'dharrison@email.com','(313) 555-0141','18320 Livernois Ave','Detroit','MI','48221',
 42.4282,-83.1412, 900.00,'2025-10-28'),

('d0000042-0000-0000-0000-000000000042','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Timothy Foster','Timothy','Foster',
 'tfoster@email.com','(614) 555-0142','1842 N High St','Columbus','OH','43201',
 40.0017,-83.0075, 1400.00,'2025-11-30'),

('d0000043-0000-0000-0000-000000000043','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Isabella & Rafael Santos','Isabella','Santos',
 'isantos@email.com','(305) 555-0143','2800 SW 27th Ave','Miami','FL','33133',
 25.7430,-80.2397, 4800.00,'2026-02-10'),

('d0000044-0000-0000-0000-000000000044','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Karen Brooks','Karen','Brooks',
 'kbrooks@email.com','(407) 555-0144','3600 Corrine Dr','Orlando','FL','32803',
 28.5712,-81.3440, 1100.00,'2025-12-01'),

('d0000045-0000-0000-0000-000000000045','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Jonathan & Cynthia Park','Jonathan','Park',
 'jpark@email.com','(212) 555-0145','310 W 86th St','New York','NY','10024',
 40.7859,-73.9806, 8500.00,'2026-01-22'),

('d0000046-0000-0000-0000-000000000046','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Stephen & Helen Walsh','Stephen','Walsh',
 'swalsh@email.com','(215) 555-0146','2040 Spruce St','Philadelphia','PA','19103',
 39.9464,-75.1693, 3100.00,'2025-10-05'),

('d0000047-0000-0000-0000-000000000047','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Rachel Cohen','Rachel','Cohen',
 'rcohen@email.com','(617) 555-0147','45 Commonwealth Ave','Boston','MA','02116',
 42.3531,-71.0760, 2600.00,'2025-12-14'),

('d0000048-0000-0000-0000-000000000048','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Gregory & Angela Carter','Gregory','Carter',
 'gcarter@email.com','(202) 555-0148','4520 Wisconsin Ave NW','Washington','DC','20016',
 38.9462,-77.0724, 4500.00,'2026-01-08'),

('d0000049-0000-0000-0000-000000000049','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Brenda Morrison','Brenda','Morrison',
 'bmorrison@email.com','(919) 555-0149','612 Glenwood Ave','Raleigh','NC','27603',
 35.7831,-78.6548, 1700.00,'2025-11-11'),

('d0000050-0000-0000-0000-000000000050','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Scott & Amy Reynolds','Scott','Reynolds',
 'sreynolds@email.com','(512) 555-0150','1910 Barton Springs Rd','Austin','TX','78704',
 30.2592,-97.7616, 2900.00,'2025-12-30'),

('d0000051-0000-0000-0000-000000000051','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Larry & Nancy Nelson','Larry','Nelson',
 'lnelson@email.com','(317) 555-0151','5810 N Illinois St','Indianapolis','IN','46208',
 39.8804,-86.1507, 1600.00,'2025-09-25'),

('d0000052-0000-0000-0000-000000000052','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Gary Edwards','Gary','Edwards',
 'gedwards@email.com','(314) 555-0152','3840 Lindell Blvd','St. Louis','MO','63108',
 38.6388,-90.2521, 1300.00,'2025-10-18'),

('d0000053-0000-0000-0000-000000000053','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Diana Collins','Diana','Collins',
 'dcollins@email.com','(816) 555-0153','4820 Main St','Kansas City','MO','64112',
 39.0512,-94.5900, 900.00,'2025-11-20'),

('d0000054-0000-0000-0000-000000000054','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Arthur & Sandra Price','Arthur','Price',
 'aprice@email.com','(702) 555-0154','2801 S Eastern Ave','Las Vegas','NV','89109',
 36.1104,-115.1267, 2400.00,'2026-01-17'),

('d0000055-0000-0000-0000-000000000055','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Spencer & Faith Christensen','Spencer','Christensen',
 'schristensen@email.com','(801) 555-0155','1620 E Harvard Ave','Salt Lake City','UT','84105',
 40.7498,-111.8602, 1800.00,'2025-12-05'),

-- ── NEW DONORS ─────────────────────────────────────────

('d0000056-0000-0000-0000-000000000056','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Claire MacKenzie','Claire','MacKenzie',
 'cmackenzie@email.com','(208) 555-0156','810 W Jefferson St','Boise','ID','83702',
 43.6124,-116.2023, 300.00,'2026-02-12'),

('d0000057-0000-0000-0000-000000000057','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Tomas Kowalski','Tomas','Kowalski',
 'tkowalski@email.com','(414) 555-0157','2640 N Downer Ave','Milwaukee','WI','53211',
 43.0695,-87.8870, 150.00,'2026-01-28'),

('d0000058-0000-0000-0000-000000000058','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Bridget Thibodaux','Bridget','Thibodaux',
 'bthibodaux@email.com','(504) 555-0158','1830 Magazine St','New Orleans','LA','70130',
 29.9390,-90.0716, 200.00,'2026-02-08'),

('d0000059-0000-0000-0000-000000000059','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Dustin & Kim Hale','Dustin','Hale',
 'dhale@email.com','(405) 555-0159','4410 N Lincoln Blvd','Oklahoma City','OK','73105',
 35.5014,-97.5284, 400.00,'2026-02-20'),

('d0000060-0000-0000-0000-000000000060','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Nadia Freeman','Nadia','Freeman',
 'nfreeman@email.com','(804) 555-0160','2220 Monument Ave','Richmond','VA','23220',
 37.5620,-77.4782, 250.00,'2026-01-14'),

('d0000061-0000-0000-0000-000000000061','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Eduardo Vargas','Eduardo','Vargas',
 'evargas@email.com','(619) 555-0161','3811 Park Blvd','San Diego','CA','92103',
 32.7422,-117.1299, 500.00,'2026-02-15'),

('d0000062-0000-0000-0000-000000000062','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Patricia & John Whitmore','Patricia','Whitmore',
 'pwhitmore@email.com','(916) 555-0162','2140 Capitol Ave','Sacramento','CA','95816',
 38.5781,-121.4903, 350.00,'2026-02-03'),

('d0000063-0000-0000-0000-000000000063','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Rosa Flores','Rosa','Flores',
 'rflores@email.com','(505) 555-0163','3800 Rio Grande Blvd NW','Albuquerque','NM','87107',
 35.1228,-106.6756, 150.00,'2026-01-22'),

('d0000064-0000-0000-0000-000000000064','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Carlos Rivera','Carlos','Rivera',
 'crivera@email.com','(210) 555-0164','1904 San Pedro Ave','San Antonio','TX','78212',
 29.4681,-98.4906, 200.00,'2026-02-17'),

('d0000065-0000-0000-0000-000000000065','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Brittany Owens','Brittany','Owens',
 'bowens@email.com','(904) 555-0165','1820 Hendricks Ave','Jacksonville','FL','32207',
 30.3065,-81.6385, 100.00,'2026-02-05'),

-- ── LAPSED DONORS (13–22 months since last gift) ───────

('d0000066-0000-0000-0000-000000000066','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Leonard & Kay Murphy','Leonard','Murphy',
 'lmurphy@email.com','(410) 555-0166','3012 N Charles St','Baltimore','MD','21218',
 39.3295,-76.6227, 1800.00,'2024-09-12'),

('d0000067-0000-0000-0000-000000000067','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Howard Jenkins','Howard','Jenkins',
 'hjenkins@email.com','(813) 555-0167','4401 Bayshore Blvd','Tampa','FL','33611',
 27.8959,-82.4900, 1200.00,'2024-11-04'),

('d0000068-0000-0000-0000-000000000068','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Gina Ferrante','Gina','Ferrante',
 'gferrante@email.com','(401) 555-0168','380 Angell St','Providence','RI','02906',
 41.8275,-71.3944, 700.00,'2024-10-20'),

('d0000069-0000-0000-0000-000000000069','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'William & Mary Gallagher','William','Gallagher',
 'wgallagher@email.com','(860) 555-0169','95 Scarborough St','Hartford','CT','06105',
 41.7722,-72.7041, 1400.00,'2024-12-15'),

('d0000070-0000-0000-0000-000000000070','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Patricia Simmons','Patricia','Simmons',
 'psimmons@email.com','(803) 555-0170','4020 Devine St','Columbia','SC','29205',
 33.9908,-81.0282, 900.00,'2024-08-30'),

('d0000071-0000-0000-0000-000000000071','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Henry & Louise Morrison','Henry','Morrison',
 'hmorrison@email.com','(206) 555-0171','6820 35th Ave NE','Seattle','WA','98115',
 47.6804,-122.2813, 2100.00,'2024-11-18'),

('d0000072-0000-0000-0000-000000000072','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Diana Walsh','Diana','Walsh',
 'dwalsh@email.com','(503) 555-0172','1440 SE Hawthorne Blvd','Portland','OR','97214',
 45.5121,-122.6427, 800.00,'2024-10-05'),

('d0000073-0000-0000-0000-000000000073','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Bernard & Ruth Campbell','Bernard','Campbell',
 'bcampbell@email.com','(720) 555-0173','1840 S Colorado Blvd','Denver','CO','80222',
 39.6716,-104.9411, 1600.00,'2024-12-02'),

('d0000074-0000-0000-0000-000000000074','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Victoria Morales','Victoria','Morales',
 'vmorales@email.com','(512) 555-0174','1212 S Congress Ave','Austin','TX','78704',
 30.2490,-97.7500, 1100.00,'2024-09-28'),

('d0000075-0000-0000-0000-000000000075','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Lawrence Kelly','Lawrence','Kelly',
 'lkelly@email.com','(312) 555-0175','2418 N Halsted St','Chicago','IL','60614',
 41.9245,-87.6491, 1900.00,'2024-11-10'),

-- ── LOST DONORS (24+ months since last gift) ───────────

('d0000076-0000-0000-0000-000000000076','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Theodore & Frances Nelson','Theodore','Nelson',
 'tnelson@email.com','(212) 555-0176','640 Riverside Dr','New York','NY','10031',
 40.8214,-73.9609, 3200.00,'2023-08-15'),

('d0000077-0000-0000-0000-000000000077','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Paul Fitzgerald','Paul','Fitzgerald',
 'pfitzgerald@email.com','(617) 555-0177','22 Chestnut St','Boston','MA','02108',
 42.3590,-71.0678, 900.00,'2023-11-20'),

('d0000078-0000-0000-0000-000000000078','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Gloria Hernandez','Gloria','Hernandez',
 'ghernandez@email.com','(305) 555-0178','380 Alhambra Circle','Miami','FL','33134',
 25.7482,-80.2611, 700.00,'2023-09-10'),

('d0000079-0000-0000-0000-000000000079','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Harold Stone','Harold','Stone',
 'hstone@email.com','(602) 555-0179','5642 N 7th St','Phoenix','AZ','85014',
 33.5370,-112.0672, 1400.00,'2023-10-05'),

('d0000080-0000-0000-0000-000000000080','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Martha Quinn','Martha','Quinn',
 'mquinn@email.com','(919) 555-0180','820 Oberlin Rd','Raleigh','NC','27605',
 35.7872,-78.6710, 800.00,'2023-07-22'),

('d0000081-0000-0000-0000-000000000081','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Ronald & Dorothy Chambers','Ronald','Chambers',
 'rchambers@email.com','(310) 555-0181','2204 Malcolm Ave','Los Angeles','CA','90064',
 34.0427,-118.4363, 4500.00,'2023-05-18'),

('d0000082-0000-0000-0000-000000000082','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Dennis Franklin','Dennis','Franklin',
 'dfranklin@email.com','(214) 555-0182','6820 Lakewood Blvd','Dallas','TX','75214',
 32.8244,-96.7337, 2200.00,'2023-09-30'),

('d0000083-0000-0000-0000-000000000083','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Lori & James Strand','Lori','Strand',
 'lstrand@email.com','(612) 555-0183','4540 Lyndale Ave S','Minneapolis','MN','55419',
 44.9064,-93.2990, 1100.00,'2023-06-12'),

('d0000084-0000-0000-0000-000000000084','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Clifford Murray','Clifford','Murray',
 'cmurray@email.com','(713) 555-0184','3820 Westheimer Rd','Houston','TX','77027',
 29.7381,-95.4509, 650.00,'2023-11-08'),

('d0000085-0000-0000-0000-000000000085','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Barbara & George Schneider','Barbara','Schneider',
 'bschneider@email.com','(215) 555-0185','444 Germantown Ave','Philadelphia','PA','19144',
 40.0371,-75.1530, 1700.00,'2023-08-25'),

-- ── MORE ACTIVE DONORS ─────────────────────────────────

('d0000086-0000-0000-0000-000000000086','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Allen & Ruth Prescott','Allen','Prescott',
 'aprescott@email.com','(918) 555-0186','2840 S Harvard Ave','Tulsa','OK','74114',
 36.1240,-95.9702, 2600.00,'2025-12-18'),

('d0000087-0000-0000-0000-000000000087','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Philip & Charlotte Duncan','Philip','Duncan',
 'pduncan@email.com','(502) 555-0187','2218 Dundee Rd','Louisville','KY','40205',
 38.2318,-85.6880, 1900.00,'2025-11-24'),

('d0000088-0000-0000-0000-000000000088','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Eugene & Mary Beth Harrington','Eugene','Harrington',
 'eharrington@email.com','(501) 555-0188','4210 Kavanaugh Blvd','Little Rock','AR','72205',
 34.7489,-92.3277, 1200.00,'2025-10-09'),

('d0000089-0000-0000-0000-000000000089','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Catherine Beaumont','Catherine','Beaumont',
 'cbeaumont@email.com','(912) 555-0189','210 E Gaston St','Savannah','GA','31401',
 32.0766,-81.0952, 1500.00,'2025-12-20'),

('d0000090-0000-0000-0000-000000000090','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Maxwell & Irene Whitaker','Maxwell','Whitaker',
 'mwhitaker@email.com','(843) 555-0190','44 Church St','Charleston','SC','29401',
 32.7793,-79.9386, 3400.00,'2026-01-06'),

('d0000091-0000-0000-0000-000000000091','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Nathan & Sandra Mills','Nathan','Mills',
 'nmills@email.com','(307) 555-0191','2018 E 19th St','Cheyenne','WY','82001',
 41.1425,-104.8007, 1100.00,'2025-09-14'),

('d0000092-0000-0000-0000-000000000092','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Vernon & Alice Tucker','Vernon','Tucker',
 'vtucker@email.com','(406) 555-0192','1820 Grand Ave','Billings','MT','59102',
 45.7774,-108.5348, 900.00,'2025-11-02'),

('d0000093-0000-0000-0000-000000000093','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Clara & Donovan Pierce','Clara','Pierce',
 'cpierce@email.com','(859) 555-0193','820 Fontaine Rd','Lexington','KY','40502',
 37.9923,-84.4710, 1700.00,'2026-01-30'),

('d0000094-0000-0000-0000-000000000094','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Raymond Salas','Raymond','Salas',
 'rsalas@email.com','(505) 555-0194','1640 Rio Grande Blvd NW','Albuquerque','NM','87104',
 35.1032,-106.6672, 800.00,'2025-10-22'),

('d0000095-0000-0000-0000-000000000095','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Maria & George Lopez','Maria','Lopez',
 'mlopez@email.com','(520) 555-0195','3820 E Speedway Blvd','Tucson','AZ','85716',
 32.2348,-110.9077, 1400.00,'2025-12-10'),

('d0000096-0000-0000-0000-000000000096','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Frank & Barbara Donovan','Frank','Donovan',
 'fdonovan@email.com','(412) 555-0196','5412 Walnut St','Pittsburgh','PA','15232',
 40.4512,-79.9262, 2800.00,'2025-11-15'),

('d0000097-0000-0000-0000-000000000097','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Arthur & Rita Bishop','Arthur','Bishop',
 'abishop@email.com','(216) 555-0197','2820 Fairmount Blvd','Cleveland','OH','44118',
 41.5148,-81.5832, 1600.00,'2025-10-30'),

('d0000098-0000-0000-0000-000000000098','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Margaret & Paul Sullivan','Margaret','Sullivan',
 'msullivan@email.com','(513) 555-0198','4410 Erie Ave','Cincinnati','OH','45208',
 39.1411,-84.4369, 2100.00,'2026-01-20'),

('d0000099-0000-0000-0000-000000000099','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Karen & Robert Thornton','Karen','Thornton',
 'kthornton@email.com','(651) 555-0199','1440 Summit Ave','St. Paul','MN','55105',
 44.9434,-93.1588, 1500.00,'2025-12-28'),

('d0000100-0000-0000-0000-000000000100','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Harold & Pearl Zimmerman','Harold','Zimmerman',
 'hzimmerman@email.com','(402) 555-0200','4210 Dodge St','Omaha','NE','68131',
 41.2686,-96.0187, 1200.00,'2025-11-08')

ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- DONATIONS for new donors (1–2 per donor)
-- -------------------------------------------------------
INSERT INTO donations (id, donor_id, amount, date, memo) VALUES

-- Active donors
(gen_random_uuid(),'d0000031-0000-0000-0000-000000000031',2000.00,'2026-01-10','Year-End Gift — 2026-01-10'),
(gen_random_uuid(),'d0000031-0000-0000-0000-000000000031',1500.00,'2025-06-15','General Fund — 2025-06-15'),
(gen_random_uuid(),'d0000032-0000-0000-0000-000000000032',1500.00,'2025-12-22','Year-End Gift — 2025-12-22'),
(gen_random_uuid(),'d0000032-0000-0000-0000-000000000032',1300.00,'2025-06-08','General Fund — 2025-06-08'),
(gen_random_uuid(),'d0000033-0000-0000-0000-000000000033',2500.00,'2026-01-28','Annual Fund — 2026-01-28'),
(gen_random_uuid(),'d0000033-0000-0000-0000-000000000033',1700.00,'2025-07-14','Capital Campaign — 2025-07-14'),
(gen_random_uuid(),'d0000034-0000-0000-0000-000000000034',3500.00,'2025-11-18','General Fund — 2025-11-18'),
(gen_random_uuid(),'d0000034-0000-0000-0000-000000000034',3000.00,'2025-04-10','Easter Offering — 2025-04-10'),
(gen_random_uuid(),'d0000035-0000-0000-0000-000000000035',1000.00,'2025-10-14','General Fund — 2025-10-14'),
(gen_random_uuid(),'d0000035-0000-0000-0000-000000000035', 800.00,'2025-04-20','Easter Offering — 2025-04-20'),
(gen_random_uuid(),'d0000036-0000-0000-0000-000000000036',1800.00,'2026-02-01','Annual Fund — 2026-02-01'),
(gen_random_uuid(),'d0000036-0000-0000-0000-000000000036',1400.00,'2025-07-22','General Fund — 2025-07-22'),
(gen_random_uuid(),'d0000037-0000-0000-0000-000000000037',3000.00,'2025-12-08','Year-End Gift — 2025-12-08'),
(gen_random_uuid(),'d0000037-0000-0000-0000-000000000037',2500.00,'2025-05-05','Capital Campaign — 2025-05-05'),
(gen_random_uuid(),'d0000038-0000-0000-0000-000000000038',1200.00,'2025-11-05','General Fund — 2025-11-05'),
(gen_random_uuid(),'d0000038-0000-0000-0000-000000000038',1000.00,'2025-05-18','Easter Offering — 2025-05-18'),
(gen_random_uuid(),'d0000039-0000-0000-0000-000000000039',2000.00,'2026-01-15','Annual Fund — 2026-01-15'),
(gen_random_uuid(),'d0000039-0000-0000-0000-000000000039',1800.00,'2025-06-20','General Fund — 2025-06-20'),
(gen_random_uuid(),'d0000040-0000-0000-0000-000000000040', 800.00,'2025-09-19','General Fund — 2025-09-19'),
(gen_random_uuid(),'d0000040-0000-0000-0000-000000000040', 700.00,'2025-03-10','Annual Fund — 2025-03-10'),
(gen_random_uuid(),'d0000041-0000-0000-0000-000000000041', 500.00,'2025-10-28','General Fund — 2025-10-28'),
(gen_random_uuid(),'d0000041-0000-0000-0000-000000000041', 400.00,'2025-04-15','Easter Offering — 2025-04-15'),
(gen_random_uuid(),'d0000042-0000-0000-0000-000000000042', 750.00,'2025-11-30','General Fund — 2025-11-30'),
(gen_random_uuid(),'d0000042-0000-0000-0000-000000000042', 650.00,'2025-05-12','Easter Offering — 2025-05-12'),
(gen_random_uuid(),'d0000043-0000-0000-0000-000000000043',2500.00,'2026-02-10','Annual Fund — 2026-02-10'),
(gen_random_uuid(),'d0000043-0000-0000-0000-000000000043',2300.00,'2025-08-04','Building Fund — 2025-08-04'),
(gen_random_uuid(),'d0000044-0000-0000-0000-000000000044', 600.00,'2025-12-01','General Fund — 2025-12-01'),
(gen_random_uuid(),'d0000044-0000-0000-0000-000000000044', 500.00,'2025-06-10','Easter Offering — 2025-06-10'),
(gen_random_uuid(),'d0000045-0000-0000-0000-000000000045',5000.00,'2026-01-22','Capital Campaign — 2026-01-22'),
(gen_random_uuid(),'d0000045-0000-0000-0000-000000000045',3500.00,'2025-07-14','Building Fund — 2025-07-14'),
(gen_random_uuid(),'d0000046-0000-0000-0000-000000000046',1700.00,'2025-10-05','General Fund — 2025-10-05'),
(gen_random_uuid(),'d0000046-0000-0000-0000-000000000046',1400.00,'2025-04-28','Easter Offering — 2025-04-28'),
(gen_random_uuid(),'d0000047-0000-0000-0000-000000000047',1400.00,'2025-12-14','Year-End Gift — 2025-12-14'),
(gen_random_uuid(),'d0000047-0000-0000-0000-000000000047',1200.00,'2025-06-02','General Fund — 2025-06-02'),
(gen_random_uuid(),'d0000048-0000-0000-0000-000000000048',2500.00,'2026-01-08','Annual Fund — 2026-01-08'),
(gen_random_uuid(),'d0000048-0000-0000-0000-000000000048',2000.00,'2025-07-25','Capital Campaign — 2025-07-25'),
(gen_random_uuid(),'d0000049-0000-0000-0000-000000000049', 900.00,'2025-11-11','General Fund — 2025-11-11'),
(gen_random_uuid(),'d0000049-0000-0000-0000-000000000049', 800.00,'2025-05-08','Easter Offering — 2025-05-08'),
(gen_random_uuid(),'d0000050-0000-0000-0000-000000000050',1500.00,'2025-12-30','Year-End Gift — 2025-12-30'),
(gen_random_uuid(),'d0000050-0000-0000-0000-000000000050',1400.00,'2025-06-18','General Fund — 2025-06-18'),
(gen_random_uuid(),'d0000051-0000-0000-0000-000000000051', 850.00,'2025-09-25','General Fund — 2025-09-25'),
(gen_random_uuid(),'d0000051-0000-0000-0000-000000000051', 750.00,'2025-03-20','Annual Fund — 2025-03-20'),
(gen_random_uuid(),'d0000052-0000-0000-0000-000000000052', 700.00,'2025-10-18','General Fund — 2025-10-18'),
(gen_random_uuid(),'d0000052-0000-0000-0000-000000000052', 600.00,'2025-04-05','Easter Offering — 2025-04-05'),
(gen_random_uuid(),'d0000053-0000-0000-0000-000000000053', 500.00,'2025-11-20','General Fund — 2025-11-20'),
(gen_random_uuid(),'d0000053-0000-0000-0000-000000000053', 400.00,'2025-05-28','Easter Offering — 2025-05-28'),
(gen_random_uuid(),'d0000054-0000-0000-0000-000000000054',1300.00,'2026-01-17','Annual Fund — 2026-01-17'),
(gen_random_uuid(),'d0000054-0000-0000-0000-000000000054',1100.00,'2025-07-08','General Fund — 2025-07-08'),
(gen_random_uuid(),'d0000055-0000-0000-0000-000000000055',1000.00,'2025-12-05','Year-End Gift — 2025-12-05'),
(gen_random_uuid(),'d0000055-0000-0000-0000-000000000055', 800.00,'2025-06-22','General Fund — 2025-06-22'),

-- New donors
(gen_random_uuid(),'d0000056-0000-0000-0000-000000000056', 300.00,'2026-02-12','First Gift — 2026-02-12'),
(gen_random_uuid(),'d0000057-0000-0000-0000-000000000057', 150.00,'2026-01-28','First Gift — 2026-01-28'),
(gen_random_uuid(),'d0000058-0000-0000-0000-000000000058', 200.00,'2026-02-08','First Gift — 2026-02-08'),
(gen_random_uuid(),'d0000059-0000-0000-0000-000000000059', 400.00,'2026-02-20','First Gift — 2026-02-20'),
(gen_random_uuid(),'d0000060-0000-0000-0000-000000000060', 250.00,'2026-01-14','First Gift — 2026-01-14'),
(gen_random_uuid(),'d0000061-0000-0000-0000-000000000061', 500.00,'2026-02-15','First Gift — 2026-02-15'),
(gen_random_uuid(),'d0000062-0000-0000-0000-000000000062', 350.00,'2026-02-03','First Gift — 2026-02-03'),
(gen_random_uuid(),'d0000063-0000-0000-0000-000000000063', 150.00,'2026-01-22','First Gift — 2026-01-22'),
(gen_random_uuid(),'d0000064-0000-0000-0000-000000000064', 200.00,'2026-02-17','First Gift — 2026-02-17'),
(gen_random_uuid(),'d0000065-0000-0000-0000-000000000065', 100.00,'2026-02-05','First Gift — 2026-02-05'),

-- Lapsed donors
(gen_random_uuid(),'d0000066-0000-0000-0000-000000000066',1000.00,'2024-09-12','General Fund — 2024-09-12'),
(gen_random_uuid(),'d0000066-0000-0000-0000-000000000066', 800.00,'2024-02-14','Annual Fund — 2024-02-14'),
(gen_random_uuid(),'d0000067-0000-0000-0000-000000000067', 700.00,'2024-11-04','General Fund — 2024-11-04'),
(gen_random_uuid(),'d0000067-0000-0000-0000-000000000067', 500.00,'2024-05-20','Easter Offering — 2024-05-20'),
(gen_random_uuid(),'d0000068-0000-0000-0000-000000000068', 400.00,'2024-10-20','General Fund — 2024-10-20'),
(gen_random_uuid(),'d0000068-0000-0000-0000-000000000068', 300.00,'2024-04-08','Easter Offering — 2024-04-08'),
(gen_random_uuid(),'d0000069-0000-0000-0000-000000000069', 800.00,'2024-12-15','Year-End Gift — 2024-12-15'),
(gen_random_uuid(),'d0000069-0000-0000-0000-000000000069', 600.00,'2024-06-10','General Fund — 2024-06-10'),
(gen_random_uuid(),'d0000070-0000-0000-0000-000000000070', 500.00,'2024-08-30','General Fund — 2024-08-30'),
(gen_random_uuid(),'d0000070-0000-0000-0000-000000000070', 400.00,'2024-02-05','Annual Fund — 2024-02-05'),
(gen_random_uuid(),'d0000071-0000-0000-0000-000000000071',1200.00,'2024-11-18','Year-End Gift — 2024-11-18'),
(gen_random_uuid(),'d0000071-0000-0000-0000-000000000071', 900.00,'2024-05-14','General Fund — 2024-05-14'),
(gen_random_uuid(),'d0000072-0000-0000-0000-000000000072', 500.00,'2024-10-05','General Fund — 2024-10-05'),
(gen_random_uuid(),'d0000072-0000-0000-0000-000000000072', 300.00,'2024-04-18','Easter Offering — 2024-04-18'),
(gen_random_uuid(),'d0000073-0000-0000-0000-000000000073', 900.00,'2024-12-02','Year-End Gift — 2024-12-02'),
(gen_random_uuid(),'d0000073-0000-0000-0000-000000000073', 700.00,'2024-06-20','General Fund — 2024-06-20'),
(gen_random_uuid(),'d0000074-0000-0000-0000-000000000074', 600.00,'2024-09-28','General Fund — 2024-09-28'),
(gen_random_uuid(),'d0000074-0000-0000-0000-000000000074', 500.00,'2024-03-12','Easter Offering — 2024-03-12'),
(gen_random_uuid(),'d0000075-0000-0000-0000-000000000075',1100.00,'2024-11-10','General Fund — 2024-11-10'),
(gen_random_uuid(),'d0000075-0000-0000-0000-000000000075', 800.00,'2024-05-05','Easter Offering — 2024-05-05'),

-- Lost donors
(gen_random_uuid(),'d0000076-0000-0000-0000-000000000076',2000.00,'2023-08-15','General Fund — 2023-08-15'),
(gen_random_uuid(),'d0000076-0000-0000-0000-000000000076',1200.00,'2023-01-10','Annual Fund — 2023-01-10'),
(gen_random_uuid(),'d0000077-0000-0000-0000-000000000077', 500.00,'2023-11-20','Year-End Gift — 2023-11-20'),
(gen_random_uuid(),'d0000077-0000-0000-0000-000000000077', 400.00,'2023-05-08','General Fund — 2023-05-08'),
(gen_random_uuid(),'d0000078-0000-0000-0000-000000000078', 400.00,'2023-09-10','General Fund — 2023-09-10'),
(gen_random_uuid(),'d0000078-0000-0000-0000-000000000078', 300.00,'2023-03-22','Easter Offering — 2023-03-22'),
(gen_random_uuid(),'d0000079-0000-0000-0000-000000000079', 800.00,'2023-10-05','General Fund — 2023-10-05'),
(gen_random_uuid(),'d0000079-0000-0000-0000-000000000079', 600.00,'2023-04-14','Easter Offering — 2023-04-14'),
(gen_random_uuid(),'d0000080-0000-0000-0000-000000000080', 500.00,'2023-07-22','General Fund — 2023-07-22'),
(gen_random_uuid(),'d0000080-0000-0000-0000-000000000080', 300.00,'2023-01-30','Annual Fund — 2023-01-30'),
(gen_random_uuid(),'d0000081-0000-0000-0000-000000000081',2500.00,'2023-05-18','General Fund — 2023-05-18'),
(gen_random_uuid(),'d0000081-0000-0000-0000-000000000081',2000.00,'2022-12-10','Year-End Gift — 2022-12-10'),
(gen_random_uuid(),'d0000082-0000-0000-0000-000000000082',1200.00,'2023-09-30','General Fund — 2023-09-30'),
(gen_random_uuid(),'d0000082-0000-0000-0000-000000000082',1000.00,'2023-03-15','Easter Offering — 2023-03-15'),
(gen_random_uuid(),'d0000083-0000-0000-0000-000000000083', 600.00,'2023-06-12','General Fund — 2023-06-12'),
(gen_random_uuid(),'d0000083-0000-0000-0000-000000000083', 500.00,'2022-12-20','Year-End Gift — 2022-12-20'),
(gen_random_uuid(),'d0000084-0000-0000-0000-000000000084', 400.00,'2023-11-08','General Fund — 2023-11-08'),
(gen_random_uuid(),'d0000084-0000-0000-0000-000000000084', 250.00,'2023-05-28','Easter Offering — 2023-05-28'),
(gen_random_uuid(),'d0000085-0000-0000-0000-000000000085', 900.00,'2023-08-25','General Fund — 2023-08-25'),
(gen_random_uuid(),'d0000085-0000-0000-0000-000000000085', 800.00,'2023-02-14','Annual Fund — 2023-02-14'),

-- More active donors
(gen_random_uuid(),'d0000086-0000-0000-0000-000000000086',1500.00,'2025-12-18','Year-End Gift — 2025-12-18'),
(gen_random_uuid(),'d0000086-0000-0000-0000-000000000086',1100.00,'2025-06-05','General Fund — 2025-06-05'),
(gen_random_uuid(),'d0000087-0000-0000-0000-000000000087',1000.00,'2025-11-24','General Fund — 2025-11-24'),
(gen_random_uuid(),'d0000087-0000-0000-0000-000000000087', 900.00,'2025-05-15','Easter Offering — 2025-05-15'),
(gen_random_uuid(),'d0000088-0000-0000-0000-000000000088', 700.00,'2025-10-09','General Fund — 2025-10-09'),
(gen_random_uuid(),'d0000088-0000-0000-0000-000000000088', 500.00,'2025-04-25','Easter Offering — 2025-04-25'),
(gen_random_uuid(),'d0000089-0000-0000-0000-000000000089', 800.00,'2025-12-20','Year-End Gift — 2025-12-20'),
(gen_random_uuid(),'d0000089-0000-0000-0000-000000000089', 700.00,'2025-06-28','General Fund — 2025-06-28'),
(gen_random_uuid(),'d0000090-0000-0000-0000-000000000090',2000.00,'2026-01-06','Annual Fund — 2026-01-06'),
(gen_random_uuid(),'d0000090-0000-0000-0000-000000000090',1400.00,'2025-07-10','Capital Campaign — 2025-07-10'),
(gen_random_uuid(),'d0000091-0000-0000-0000-000000000091', 600.00,'2025-09-14','General Fund — 2025-09-14'),
(gen_random_uuid(),'d0000091-0000-0000-0000-000000000091', 500.00,'2025-03-08','Annual Fund — 2025-03-08'),
(gen_random_uuid(),'d0000092-0000-0000-0000-000000000092', 500.00,'2025-11-02','General Fund — 2025-11-02'),
(gen_random_uuid(),'d0000092-0000-0000-0000-000000000092', 400.00,'2025-04-20','Easter Offering — 2025-04-20'),
(gen_random_uuid(),'d0000093-0000-0000-0000-000000000093', 900.00,'2026-01-30','Annual Fund — 2026-01-30'),
(gen_random_uuid(),'d0000093-0000-0000-0000-000000000093', 800.00,'2025-07-18','General Fund — 2025-07-18'),
(gen_random_uuid(),'d0000094-0000-0000-0000-000000000094', 450.00,'2025-10-22','General Fund — 2025-10-22'),
(gen_random_uuid(),'d0000094-0000-0000-0000-000000000094', 350.00,'2025-04-10','Easter Offering — 2025-04-10'),
(gen_random_uuid(),'d0000095-0000-0000-0000-000000000095', 750.00,'2025-12-10','Year-End Gift — 2025-12-10'),
(gen_random_uuid(),'d0000095-0000-0000-0000-000000000095', 650.00,'2025-05-25','General Fund — 2025-05-25'),
(gen_random_uuid(),'d0000096-0000-0000-0000-000000000096',1500.00,'2025-11-15','General Fund — 2025-11-15'),
(gen_random_uuid(),'d0000096-0000-0000-0000-000000000096',1300.00,'2025-05-30','Capital Campaign — 2025-05-30'),
(gen_random_uuid(),'d0000097-0000-0000-0000-000000000097', 850.00,'2025-10-30','General Fund — 2025-10-30'),
(gen_random_uuid(),'d0000097-0000-0000-0000-000000000097', 750.00,'2025-04-22','Easter Offering — 2025-04-22'),
(gen_random_uuid(),'d0000098-0000-0000-0000-000000000098',1100.00,'2026-01-20','Annual Fund — 2026-01-20'),
(gen_random_uuid(),'d0000098-0000-0000-0000-000000000098',1000.00,'2025-06-14','General Fund — 2025-06-14'),
(gen_random_uuid(),'d0000099-0000-0000-0000-000000000099', 800.00,'2025-12-28','Year-End Gift — 2025-12-28'),
(gen_random_uuid(),'d0000099-0000-0000-0000-000000000099', 700.00,'2025-06-18','General Fund — 2025-06-18'),
(gen_random_uuid(),'d0000100-0000-0000-0000-000000000100', 700.00,'2025-11-08','General Fund — 2025-11-08'),
(gen_random_uuid(),'d0000100-0000-0000-0000-000000000100', 500.00,'2025-05-12','Easter Offering — 2025-05-12');


-- -------------------------------------------------------
-- REPORT FOLDERS (4 folders)
-- -------------------------------------------------------
INSERT INTO report_folders (id, name, organization_id) VALUES
('f0000001-0000-0000-0000-000000000001','Annual Fund','1aead71c-6bd4-484d-935d-36d6aa2b2f1b'),
('f0000002-0000-0000-0000-000000000002','Major Donors','1aead71c-6bd4-484d-935d-36d6aa2b2f1b'),
('f0000003-0000-0000-0000-000000000003','Lapsed & Re-engagement','1aead71c-6bd4-484d-935d-36d6aa2b2f1b'),
('f0000004-0000-0000-0000-000000000004','Geographic Outreach','1aead71c-6bd4-484d-935d-36d6aa2b2f1b')
ON CONFLICT (id) DO NOTHING;


-- -------------------------------------------------------
-- SAVED REPORTS (16 reports across 4 folders)
-- -------------------------------------------------------
INSERT INTO saved_reports (
  id, organization_id, title, type,
  query, content, summary, records_count,
  folder_id, visibility, created_at
) VALUES

-- ── Annual Fund ─────────────────────────────────────────

('a0000001-0000-0000-0000-000000000001','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 '2025 Annual Fund Donors','FILTER',
 'SELECT display_name, email, total_lifetime_value, last_donation_date FROM donors WHERE org_id = $1 AND last_donation_date >= ''2025-01-01'' AND last_donation_date <= ''2025-12-31'' ORDER BY total_lifetime_value DESC',
 '',
 'All donors who made at least one gift during the 2025 calendar year, sorted by lifetime value. Use for year-end acknowledgment letters and 2026 ask strategy.',
 74,
 'f0000001-0000-0000-0000-000000000001','shared','2025-12-28 09:00:00+00'),

('a0000002-0000-0000-0000-000000000002','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Q4 2025 Giving Report','FILTER',
 'SELECT display_name, email, last_donation_amount, last_donation_date FROM donors WHERE org_id = $1 AND last_donation_date >= ''2025-10-01'' AND last_donation_date <= ''2025-12-31'' ORDER BY last_donation_date DESC',
 '',
 'Donors who gave in Q4 2025 (October–December). Useful for year-end campaign performance review and board reporting.',
 48,
 'f0000001-0000-0000-0000-000000000001','shared','2026-01-02 10:30:00+00'),

('a0000003-0000-0000-0000-000000000003','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Monthly Giving Program','FILTER',
 'SELECT d.display_name, d.email, d.total_lifetime_value, COUNT(don.id) AS gift_count FROM donors d JOIN donations don ON don.donor_id = d.id WHERE d.org_id = $1 GROUP BY d.id HAVING COUNT(don.id) >= 10 ORDER BY gift_count DESC',
 '',
 'Recurring donors with 10 or more lifetime gifts. Core monthly sustainers — prioritize for stewardship calls and upgrade asks.',
 18,
 'f0000001-0000-0000-0000-000000000001','shared','2025-11-15 14:00:00+00'),

('a0000004-0000-0000-0000-000000000004','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Year-End Campaign Results 2025','FILTER',
 'SELECT display_name, email, last_donation_amount, last_donation_date, total_lifetime_value FROM donors WHERE org_id = $1 AND last_donation_date >= ''2025-11-01'' AND last_donation_date <= ''2025-12-31'' ORDER BY last_donation_amount DESC NULLS LAST',
 '',
 'Final year-end campaign results. 52 donors responded to the year-end appeal with a total of $84,200 raised — up 11% from 2024.',
 52,
 'f0000001-0000-0000-0000-000000000001','shared','2026-01-08 08:00:00+00'),

-- ── Major Donors ────────────────────────────────────────

('a0000005-0000-0000-0000-000000000005','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Major Donors ($1,000+)','FILTER',
 'SELECT display_name, email, phone, total_lifetime_value, last_donation_date FROM donors WHERE org_id = $1 AND total_lifetime_value >= 1000 ORDER BY total_lifetime_value DESC',
 '',
 'All donors with a cumulative lifetime giving of $1,000 or more. Primary major donor prospect pool for personal solicitations and leadership gift conversations.',
 38,
 'f0000002-0000-0000-0000-000000000002','shared','2025-10-01 09:00:00+00'),

('a0000006-0000-0000-0000-000000000006','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Capital Campaign Prospects','AI',
 'SELECT d.display_name, d.email, d.phone, d.total_lifetime_value, d.last_donation_date, d.billing_address, d.city, d.state FROM donors d WHERE d.org_id = $1 AND d.total_lifetime_value >= 2500 AND d.last_donation_date >= ''2024-06-01'' ORDER BY d.total_lifetime_value DESC',
 '',
 'Active donors who have given $2,500 or more in lifetime value with a gift in the last 20 months. These are the strongest prospects for a capital campaign ask at the $5,000–$25,000 level.',
 22,
 'f0000002-0000-0000-0000-000000000002','shared','2025-09-12 11:00:00+00'),

('a0000007-0000-0000-0000-000000000007','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Board Member Giving Summary','FILTER',
 'SELECT d.display_name, d.email, d.total_lifetime_value, d.last_donation_date, d.last_donation_amount FROM donors d JOIN donor_tags dt ON dt.donor_id = d.id JOIN tags t ON t.id = dt.tag_id WHERE d.org_id = $1 AND t.name = ''Board Member'' ORDER BY d.total_lifetime_value DESC',
 '',
 'Giving history for all board members. 3 of 4 board members gave in 2025. Use for board giving report and peer-to-peer solicitation planning.',
 4,
 'f0000002-0000-0000-0000-000000000002','shared','2025-11-01 10:00:00+00'),

('a0000008-0000-0000-0000-000000000008','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Legacy Giving Prospects','AI',
 'SELECT d.display_name, d.email, d.phone, d.city, d.state, d.total_lifetime_value, d.first_donation_date FROM donors d WHERE d.org_id = $1 AND d.total_lifetime_value >= 5000 AND d.first_donation_date <= ''2022-01-01'' ORDER BY d.total_lifetime_value DESC',
 '',
 'Long-tenured major donors (giving since before 2022) with $5,000+ lifetime value. Prime candidates for planned giving and estate gift conversations.',
 9,
 'f0000002-0000-0000-0000-000000000002','private','2025-08-20 13:00:00+00'),

-- ── Lapsed & Re-engagement ───────────────────────────────

('a0000009-0000-0000-0000-000000000009','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Lapsed Donor Outreach List','FILTER',
 'SELECT display_name, email, phone, last_donation_date, last_donation_amount, total_lifetime_value FROM donors WHERE org_id = $1 AND last_donation_date >= ''2024-03-01'' AND last_donation_date < ''2024-12-31'' ORDER BY total_lifetime_value DESC',
 '',
 'Donors who last gave between 15 and 24 months ago. Prioritized for personal outreach, event invitations, and re-engagement appeals before they become lost.',
 24,
 'f0000003-0000-0000-0000-000000000003','shared','2025-12-10 09:30:00+00'),

('a000000a-0000-0000-0000-00000000000a','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'High-Value Lapsed ($500+)','FILTER',
 'SELECT display_name, email, phone, last_donation_date, total_lifetime_value FROM donors WHERE org_id = $1 AND total_lifetime_value >= 500 AND last_donation_date >= ''2024-01-01'' AND last_donation_date < ''2025-01-01'' ORDER BY total_lifetime_value DESC',
 '',
 'Lapsed donors who previously gave $500 or more per year. These represent significant revenue recovery opportunity — recommend personal phone call or handwritten note from leadership.',
 14,
 'f0000003-0000-0000-0000-000000000003','shared','2025-12-15 10:00:00+00'),

('a000000b-0000-0000-0000-00000000000b','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Lost Donors (2+ Years Lapsed)','FILTER',
 'SELECT display_name, email, last_donation_date, total_lifetime_value FROM donors WHERE org_id = $1 AND last_donation_date < ''2024-01-01'' ORDER BY last_donation_date DESC',
 '',
 'Donors with no gift in over 24 months. Consider a targeted "We miss you" campaign or event invitation as a low-pressure re-engagement touchpoint.',
 15,
 'f0000003-0000-0000-0000-000000000003','shared','2025-10-22 11:00:00+00'),

('a000000c-0000-0000-0000-00000000000c','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'LYBUNT Report (2024)','AI',
 'SELECT d.display_name, d.email, d.total_lifetime_value, d.last_donation_date FROM donors d WHERE d.org_id = $1 AND d.last_donation_date >= ''2024-01-01'' AND d.last_donation_date <= ''2024-12-31'' AND NOT EXISTS (SELECT 1 FROM donations don WHERE don.donor_id = d.id AND don.date >= ''2025-01-01'') ORDER BY d.total_lifetime_value DESC',
 '',
 'Last Year But Unfortunately Not This Year (LYBUNT) — donors who gave in 2024 but have not yet given in 2025. Prime renewal list for Q1 2026 appeal.',
 19,
 'f0000003-0000-0000-0000-000000000003','shared','2026-01-05 08:30:00+00'),

-- ── Geographic Outreach ──────────────────────────────────

('a000000d-0000-0000-0000-00000000000d','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Pacific Coast Donors','FILTER',
 'SELECT display_name, email, city, state, total_lifetime_value, last_donation_date FROM donors WHERE org_id = $1 AND state IN (''CA'', ''OR'', ''WA'') ORDER BY state, total_lifetime_value DESC',
 '',
 'All donors in California, Oregon, and Washington. 12 active donors on the West Coast with combined lifetime giving of $38,400. Consider a regional cultivation event.',
 12,
 'f0000004-0000-0000-0000-000000000004','shared','2025-11-18 14:00:00+00'),

('a000000e-0000-0000-0000-00000000000e','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Northeast Corridor','FILTER',
 'SELECT display_name, email, city, state, total_lifetime_value, last_donation_date FROM donors WHERE org_id = $1 AND state IN (''NY'', ''MA'', ''CT'', ''RI'', ''PA'', ''NJ'', ''MD'', ''DC'', ''VA'') ORDER BY state, total_lifetime_value DESC',
 '',
 'Donors in the Northeast US corridor. 11 donors with combined lifetime giving of $28,700. Strong major donor concentration in NY, MA, and DC.',
 11,
 'f0000004-0000-0000-0000-000000000004','shared','2025-11-18 14:15:00+00'),

('a000000f-0000-0000-0000-00000000000f','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Southeast Region','FILTER',
 'SELECT display_name, email, city, state, total_lifetime_value, last_donation_date FROM donors WHERE org_id = $1 AND state IN (''FL'', ''GA'', ''NC'', ''SC'', ''AL'', ''MS'', ''LA'', ''AR'', ''TN'', ''KY'', ''VA'') ORDER BY state, total_lifetime_value DESC',
 '',
 'All donors across the Southeast. 34 donors — the highest concentration of any region due to home org in Tennessee. Includes Nashville area major donors and new Charlotte-area prospects.',
 34,
 'f0000004-0000-0000-0000-000000000004','shared','2025-11-18 14:30:00+00'),

('a0000010-0000-0000-0000-000000000010','1aead71c-6bd4-484d-935d-36d6aa2b2f1b',
 'Midwest & Great Plains','FILTER',
 'SELECT display_name, email, city, state, total_lifetime_value, last_donation_date FROM donors WHERE org_id = $1 AND state IN (''IL'', ''MN'', ''MO'', ''KS'', ''NE'', ''IA'', ''WI'', ''IN'', ''OH'', ''MI'', ''ND'', ''SD'', ''WY'', ''MT'') ORDER BY state, total_lifetime_value DESC',
 '',
 'Donors in the Midwest and Great Plains states. 18 donors with combined lifetime giving of $24,500. Growing region — 6 new donors added in the last 6 months.',
 18,
 'f0000004-0000-0000-0000-000000000004','shared','2025-11-18 14:45:00+00')

ON CONFLICT (id) DO NOTHING;
