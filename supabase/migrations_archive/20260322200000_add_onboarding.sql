-- Track when an org completes onboarding so the welcome wizard doesn't show again.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
