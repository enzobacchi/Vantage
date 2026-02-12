-- Saved Smart Lists: user-defined dynamic segments (filters) per organization.
create table if not exists public.saved_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  icon text not null default 'list',
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists saved_lists_organization_id_idx on public.saved_lists (organization_id);
create index if not exists saved_lists_created_at_idx on public.saved_lists (created_at desc);

comment on table public.saved_lists is 'User-defined donor list views; filters (e.g. status, state) applied in CRM.';
comment on column public.saved_lists.filters is 'Filter state to apply: e.g. { "status": "lapsed", "state": "FL" }.';

alter table public.saved_lists enable row level security;

create policy "Users can select saved_lists in their org"
  on public.saved_lists for select
  using (public.user_org_membership(organization_id));

create policy "Users can insert saved_lists in their org"
  on public.saved_lists for insert
  with check (public.user_org_membership(organization_id));

create policy "Users can delete saved_lists in their org"
  on public.saved_lists for delete
  using (public.user_org_membership(organization_id));

create policy "Service role full access to saved_lists"
  on public.saved_lists for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');
