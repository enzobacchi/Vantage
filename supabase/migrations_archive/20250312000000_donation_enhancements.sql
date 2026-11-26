-- Donation enhancements: payment method, categories, campaigns, funds
-- Run in Supabase SQL Editor

-- 1. Create org_donation_options table FIRST (donations will reference it)
CREATE TABLE IF NOT EXISTS org_donation_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('category', 'campaign', 'fund')),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique per org+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_donation_options_org_type_lower_name
  ON org_donation_options (org_id, type, lower(name));

CREATE INDEX IF NOT EXISTS idx_org_donation_options_org_type ON org_donation_options(org_id, type);

-- 2. Add payment_method to donations (before adding FKs that depend on org_donation_options)
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'other'
    CHECK (payment_method IN ('check', 'cash', 'zelle', 'wire', 'venmo', 'other', 'quickbooks'));

-- 3. Add category_id, campaign_id, fund_id (nullable FKs)
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES org_donation_options(id) ON DELETE SET NULL;

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES org_donation_options(id) ON DELETE SET NULL;

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS fund_id uuid REFERENCES org_donation_options(id) ON DELETE SET NULL;

-- 4. Backfill existing donations (QB-synced ones)
UPDATE donations
SET payment_method = 'quickbooks'
WHERE memo IS NOT NULL AND memo LIKE 'qb_sales_receipt_id:%';
