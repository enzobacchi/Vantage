-- External ID on donors: a stable identifier carried over from a previous
-- CRM (e.g. Bloomerang account number). Lets orgs migrating to Vantage keep
-- a crosswalk key between systems, and gives external integrations a lookup
-- handle that isn't the Vantage UUID.
ALTER TABLE donors ADD COLUMN IF NOT EXISTS external_id text;

-- Unique per org when present. Partial index so the many NULL rows (donors
-- not imported from another platform) don't participate.
CREATE UNIQUE INDEX IF NOT EXISTS donors_org_external_id_uniq
  ON donors(org_id, external_id) WHERE external_id IS NOT NULL;
