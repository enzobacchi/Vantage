-- QuickBooks integration columns + organization profile fields.
-- Safe to run on existing databases: all ADD COLUMN IF NOT EXISTS.

-- QuickBooks OAuth credentials
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS qb_realm_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS qb_access_token text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS qb_refresh_token text;

-- Sync tracking
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Organization profile fields used by settings
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;

-- Timestamps
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique constraint for QB callback upsert (onConflict: "qb_realm_id")
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_qb_realm_id
  ON organizations (qb_realm_id) WHERE qb_realm_id IS NOT NULL;

-- Donations: org_id for direct org scoping + source tracking
ALTER TABLE donations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_donations_org_id ON donations (org_id);
