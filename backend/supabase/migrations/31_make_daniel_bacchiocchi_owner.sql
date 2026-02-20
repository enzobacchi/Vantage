-- One-off: set Daniel Bacchiocchi as owner in their organization(s).
-- Matches auth.users by full_name (case-insensitive). Run once in Supabase SQL Editor
-- or via migration. If you prefer to use email, replace the subquery with e.g.:
--   where user_id = (select id from auth.users where email = 'daniel@example.com');

update public.organization_members
set role = 'owner'
where user_id in (
  select id
  from auth.users
  where (raw_user_meta_data->>'full_name') ilike '%daniel%bacchiocchi%'
);
