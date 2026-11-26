-- Add mailing address fields to donors (separate from billing/physical address).
ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS mailing_address text,
  ADD COLUMN IF NOT EXISTS mailing_city text,
  ADD COLUMN IF NOT EXISTS mailing_state text,
  ADD COLUMN IF NOT EXISTS mailing_zip text;
