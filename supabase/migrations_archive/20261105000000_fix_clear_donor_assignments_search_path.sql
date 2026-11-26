-- Fix: deleting any organization_members row fails with
--   relation "donors" does not exist
-- 20260612000001_rls_lockdown.sql set search_path = '' on this trigger
-- function but its body referenced `donors` unqualified. Since then every
-- membership delete has errored: web Delete Organization (the org-row
-- cascade), mobile DELETE /api/account (the auth-user cascade), and any
-- member removal. Same behavior, schema-qualified. Idempotent.

create or replace function public.clear_donor_assignments_on_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.donors
    set assigned_to = null
    where org_id = old.organization_id
      and assigned_to = old.user_id;
  return old;
end;
$function$;
