-- Org-defined custom fields on donors.
--
-- Definitions live in their own table (label, type, options) while values
-- are a JSONB map on donors keyed by definition key. JSONB over an EAV
-- value table: target orgs are <5k donors, values are read with the donor
-- in one row, and the import/export/API surfaces all want "a bag of extra
-- columns" semantics rather than relational joins.
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL,          -- machine key, slugified from label
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select')),
  options jsonb,              -- for 'select': ["a","b"]
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, key)
);

CREATE INDEX IF NOT EXISTS custom_field_definitions_org_idx
  ON custom_field_definitions(org_id, sort_order);

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}';
