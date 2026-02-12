-- Link Supabase Auth users to organizations (multi-tenant: one user can belong to one or more orgs).
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists organization_members_organization_id_idx on public.organization_members (organization_id);

comment on table public.organization_members is 'Links authenticated users to organizations; used to scope data by current user.';
comment on column public.organization_members.role is 'e.g. admin, member.';

-- Allow service role and authenticated users to read their own memberships (for RLS later).
alter table public.organization_members enable row level security;

create policy "Users can read own memberships"
  on public.organization_members for select
  using (auth.uid() = user_id);

create policy "Service role full access"
  on public.organization_members for all
  using (auth.jwt() ->> 'role' = 'service_role');
