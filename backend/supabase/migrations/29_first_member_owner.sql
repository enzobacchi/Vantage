-- Set the earliest member (by created_at) of each org to owner.
-- Use when the wrong person has owner or migration 27/28 didn't fix your account.
-- Safe to run: ensures the first-joined member is always owner.

update public.organization_members om
set role = 'owner'
from (
  select distinct on (organization_id) id
  from public.organization_members
  order by organization_id, created_at asc
) first_member
where om.id = first_member.id;
