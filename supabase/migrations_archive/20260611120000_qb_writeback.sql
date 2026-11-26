-- QuickBooks write-back (Vantage → QB) support.
--
-- qb_id + qb_txn_type link a donation to its QB transaction. qb_txn_type is
-- needed because QB ids are only unique per entity type (Invoice 5 and
-- SalesReceipt 5 can coexist) and pull-sync imports both kinds.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS qb_id text,
  ADD COLUMN IF NOT EXISTS qb_txn_type text CHECK (qb_txn_type IN ('SalesReceipt','Invoice')),
  ADD COLUMN IF NOT EXISTS qb_sync_status text CHECK (qb_sync_status IN ('pending','synced','failed')),
  ADD COLUMN IF NOT EXISTS qb_sync_error text,
  ADD COLUMN IF NOT EXISTS qb_sync_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qb_synced_at timestamptz;

-- Backstop against duplicate imports of the same QB transaction: any race
-- that slips past the application-level dedup checks violates this index
-- instead of creating a second donation row.
CREATE UNIQUE INDEX IF NOT EXISTS donations_org_qb_txn_uniq
  ON donations(org_id, qb_txn_type, qb_id) WHERE qb_id IS NOT NULL;

-- Cron retry scan: pending/failed pushes per org.
CREATE INDEX IF NOT EXISTS donations_qb_push_pending_idx
  ON donations(org_id) WHERE qb_sync_status IN ('pending','failed');

-- Write-back is explicit opt-in per org (it writes into real accounting
-- books). qb_donation_item_id caches the QB "Donation" Item used on pushed
-- SalesReceipt lines (QB requires an Item on every line).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS qb_writeback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qb_donation_item_id text;
