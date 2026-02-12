-- Add updated_at so Status and Sync can pick the most recently touched org (reconnect or token refresh).
alter table public.organizations
  add column if not exists updated_at timestamptz default now();

-- Backfill existing rows (in case they got null on add).
update public.organizations
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

comment on column public.organizations.updated_at is 'Set on insert/update; used to pick latest org (ORDER BY updated_at DESC).';

-- Auto-set updated_at on every UPDATE (so sync token refresh and any other update bumps it).
create or replace function public.set_organizations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_updated_at_trigger on public.organizations;
create trigger organizations_updated_at_trigger
  before update on public.organizations
  for each row
  execute function public.set_organizations_updated_at();
