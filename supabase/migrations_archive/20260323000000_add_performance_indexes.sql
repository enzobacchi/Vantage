-- Performance indexes for 10,000+ donor organizations
-- ============================================================================

-- ---------------------------------------------------------------------------
-- donors table
-- ---------------------------------------------------------------------------

-- Every query is org-scoped; this is the most critical index
CREATE INDEX IF NOT EXISTS idx_donors_org_id ON donors(org_id);

-- Donor listing sorted by lifetime giving (most common sort)
CREATE INDEX IF NOT EXISTS idx_donors_org_lifetime_value ON donors(org_id, total_lifetime_value DESC);

-- Lifecycle queries: find lapsed/lost donors by last donation date
CREATE INDEX IF NOT EXISTS idx_donors_org_last_donation ON donors(org_id, last_donation_date DESC);

-- Search and alphabetical sort by display name
CREATE INDEX IF NOT EXISTS idx_donors_org_display_name ON donors(org_id, display_name);

-- Email search and duplicate detection
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors(email);

-- QuickBooks sync upsert: conflict target for matching QB customers
CREATE INDEX IF NOT EXISTS idx_donors_org_qb_customer ON donors(org_id, qb_customer_id);

-- Map queries: only index donors with coordinates
CREATE INDEX IF NOT EXISTS idx_donors_location ON donors(location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- ---------------------------------------------------------------------------
-- donations table (already has idx_donations_org_id)
-- ---------------------------------------------------------------------------

-- Donor detail page: fetch all donations for a donor
CREATE INDEX IF NOT EXISTS idx_donations_donor_id ON donations(donor_id);

-- Donation listing sorted by date (most common view)
CREATE INDEX IF NOT EXISTS idx_donations_org_date ON donations(org_id, date DESC);

-- ---------------------------------------------------------------------------
-- interactions table (no org_id column — scoped via donor FK)
-- ---------------------------------------------------------------------------

-- Donor detail page: fetch all interactions for a donor
CREATE INDEX IF NOT EXISTS idx_interactions_donor_id ON interactions(donor_id);

-- Donor interactions sorted by date (newest first)
CREATE INDEX IF NOT EXISTS idx_interactions_donor_date ON interactions(donor_id, date DESC);

-- ---------------------------------------------------------------------------
-- donor_notes table
-- ---------------------------------------------------------------------------

-- Donor detail page: fetch all notes for a donor
CREATE INDEX IF NOT EXISTS idx_donor_notes_donor_id ON donor_notes(donor_id);

-- ---------------------------------------------------------------------------
-- donor_tags table (has unique constraint on donor_id, tag_id)
-- ---------------------------------------------------------------------------

-- Tag lookup by donor (donor detail page, bulk operations)
CREATE INDEX IF NOT EXISTS idx_donor_tags_donor_id ON donor_tags(donor_id);

-- Reverse lookup: find all donors with a specific tag (filtering, reports)
CREATE INDEX IF NOT EXISTS idx_donor_tags_tag_id ON donor_tags(tag_id);

-- ---------------------------------------------------------------------------
-- opportunities table (uses organization_id, not org_id)
-- ---------------------------------------------------------------------------

-- Donor detail page: fetch pipeline for a donor
CREATE INDEX IF NOT EXISTS idx_opportunities_donor_id ON opportunities(donor_id);

-- Pipeline view: filter by org and status
CREATE INDEX IF NOT EXISTS idx_opportunities_org_status ON opportunities(organization_id, status);
