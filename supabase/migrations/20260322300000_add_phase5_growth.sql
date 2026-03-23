-- Phase 5: Growth Features — audit_logs, notification_preferences, donor_merge_history
-- ============================================================================

-- 1. Audit Logs — track all mutations across the org
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,          -- 'create', 'update', 'delete', 'merge', 'bulk_delete', 'bulk_tag', 'export', 'email_send'
  entity_type text NOT NULL,     -- 'donor', 'donation', 'interaction', 'tag', 'opportunity', 'settings', 'team'
  entity_id uuid,                -- nullable for bulk ops
  summary text NOT NULL,         -- human-readable summary e.g. "Deleted 5 donors"
  details jsonb DEFAULT '{}',    -- optional structured details (old/new values, affected IDs, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Notification Preferences — per-user, per-org notification settings
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  -- Email notification toggles
  email_new_donation boolean NOT NULL DEFAULT true,
  email_donor_milestone boolean NOT NULL DEFAULT true,
  email_weekly_digest boolean NOT NULL DEFAULT true,
  email_team_activity boolean NOT NULL DEFAULT false,
  email_system_alerts boolean NOT NULL DEFAULT true,
  -- In-app notification toggles
  inapp_new_donation boolean NOT NULL DEFAULT true,
  inapp_task_reminders boolean NOT NULL DEFAULT true,
  inapp_donor_lapsed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- 3. Donor Merge History — track merges for audit/undo trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS donor_merge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kept_donor_id uuid NOT NULL,       -- the donor that survives
  merged_donor_id uuid NOT NULL,     -- the donor that was absorbed (now deleted)
  merged_donor_snapshot jsonb NOT NULL DEFAULT '{}', -- full row data of merged donor before deletion
  donations_moved integer NOT NULL DEFAULT 0,
  interactions_moved integer NOT NULL DEFAULT 0,
  notes_moved integer NOT NULL DEFAULT 0,
  tags_moved integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donor_merge_org ON donor_merge_history(org_id, created_at DESC);

ALTER TABLE donor_merge_history ENABLE ROW LEVEL SECURITY;
