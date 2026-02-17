-- Team invites and role constraint for organization_members.
-- Roles: owner (one per org, can transfer), admin (can manage team), member.
-- Security: External integrations (e.g. QuickBooks) must NOT update organization_members.role
-- or any future organizations.owner_id; only Team/Settings flows may change roles/ownership.

-- Constrain organization_members.role to allowed values
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'member'));

-- Set first member of each org (earliest created_at) to 'owner'; others remain 'member' or existing.
do $$
declare
  r record;
begin
  for r in
    select distinct on (organization_id) id, organization_id
    from public.organization_members
    order by organization_id, created_at asc
  loop
    update public.organization_members
    set role = 'owner'
    where id = r.id;
  end loop;
end $$;

-- Invitations table for team invites
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists invitations_organization_id_idx on public.invitations (organization_id);
create index if not exists invitations_token_idx on public.invitations (token);
create index if not exists invitations_expires_at_idx on public.invitations (expires_at);

comment on table public.invitations is 'Pending team invites; token used in /join?token=...';

-- RLS: only service role can manage invitations (server actions use admin client)
alter table public.invitations enable row level security;

create policy "Service role full access to invitations"
  on public.invitations for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');
