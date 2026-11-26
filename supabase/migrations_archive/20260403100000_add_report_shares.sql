-- Report Shares — junction table for sharing reports with specific users
CREATE TABLE IF NOT EXISTS report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_shares_report ON report_shares(report_id);
CREATE INDEX IF NOT EXISTS idx_report_shares_user ON report_shares(user_id);

ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;
