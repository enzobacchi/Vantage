-- Track when each user accepted the Terms of Service.
-- NULL means they haven't accepted yet and should be prompted.
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;
