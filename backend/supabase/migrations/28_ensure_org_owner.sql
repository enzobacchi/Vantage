-- Ensure every organization has at least one owner.
-- Fixes members who should be owner (e.g. sole member, or migration 27 didn't run).

-- For each org with no owner, set the earliest member (by created_at) to owner.
update public.organization_members om
set role = 'owner'
from (
  select distinct on (organization_id) id
  from public.organization_members
  where organization_id in (
    select organization_id
    from public.organization_members
    group by organization_id
    having not bool_or(role = 'owner')
  )
  order by organization_id, created_at asc
) first_member
where om.id = first_member.id;
