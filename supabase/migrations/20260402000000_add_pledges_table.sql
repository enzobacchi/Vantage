-- Pledges table: track donor commitments separate from actual donations
CREATE TABLE IF NOT EXISTS pledges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  donor_id uuid NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  frequency text NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'monthly', 'quarterly', 'annual')),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'cancelled', 'overdue')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pledges_org_id ON pledges(org_id);
CREATE INDEX IF NOT EXISTS idx_pledges_donor_id ON pledges(donor_id);
CREATE INDEX IF NOT EXISTS idx_pledges_status ON pledges(status);

-- Enable RLS (admin client bypasses, but good practice)
ALTER TABLE pledges ENABLE ROW LEVEL SECURITY;

-- Link donations to pledges (optional FK)
ALTER TABLE donations ADD COLUMN IF NOT EXISTS pledge_id uuid REFERENCES pledges(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_donations_pledge_id ON donations(pledge_id);
