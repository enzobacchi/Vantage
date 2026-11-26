-- Dashboard Preferences — per-user widget visibility toggles
-- ============================================================================

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  -- Widget visibility toggles (all default to true)
  show_metric_cards boolean NOT NULL DEFAULT true,
  show_smart_actions boolean NOT NULL DEFAULT true,
  show_donations_chart boolean NOT NULL DEFAULT true,
  show_recent_gifts boolean NOT NULL DEFAULT true,
  show_top_donors boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_user ON dashboard_preferences(user_id);

ALTER TABLE dashboard_preferences ENABLE ROW LEVEL SECURITY;
