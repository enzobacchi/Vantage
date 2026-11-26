-- Add a single-assignee "Assigned To" field on donors so organizations with
-- multiple development staff can divide donor portfolios.
--
-- Design choices:
-- * FK to auth.users(id) with ON DELETE SET NULL handles full account deletion.
-- * Same-org validity is enforced in application code; an auth user could be
--   removed from this org while still existing in auth.users (e.g. they're in
--   another org), which the FK alone can't check.
-- * A trigger on organization_members DELETE clears assigned_to for donors in
--   that org when a user is removed from the org (even though the auth.users
--   row still exists).

ALTER TABLE donors
  ADD COLUMN IF NOT EXISTS assigned_to uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS donors_org_assigned_idx
  ON donors(org_id, assigned_to);

CREATE OR REPLACE FUNCTION clear_donor_assignments_on_member_removal()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE donors
    SET assigned_to = NULL
    WHERE org_id = OLD.organization_id
      AND assigned_to = OLD.user_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_org_member_delete_clear_assignments
  ON organization_members;

CREATE TRIGGER on_org_member_delete_clear_assignments
  AFTER DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION clear_donor_assignments_on_member_removal();
