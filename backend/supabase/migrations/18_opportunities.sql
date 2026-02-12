-- Pipeline: opportunities (asks/pledges) with stages.
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  donor_id uuid not null references public.donors(id) on delete cascade,
  title text not null default 'Opportunity',
  amount numeric not null default 0,
  status text not null default 'identified'
    check (status in ('identified', 'qualified', 'solicited', 'committed', 'closed_won', 'closed_lost')),
  expected_date date,
  created_at timestamptz not null default now()
);

create index if not exists opportunities_organization_id_idx on public.opportunities (organization_id);
create index if not exists opportunities_donor_id_idx on public.opportunities (donor_id);
create index if not exists opportunities_status_idx on public.opportunities (status);

comment on table public.opportunities is 'Pipeline: future asks/pledges; drag through stages (identified -> closed_won/closed_lost).';

alter table public.opportunities enable row level security;

create policy "Users can select opportunities in their org"
  on public.opportunities for select
  using (public.user_org_membership(organization_id));

create policy "Users can insert opportunities in their org"
  on public.opportunities for insert
  with check (public.user_org_membership(organization_id));

create policy "Users can update opportunities in their org"
  on public.opportunities for update
  using (public.user_org_membership(organization_id))
  with check (public.user_org_membership(organization_id));

create policy "Users can delete opportunities in their org"
  on public.opportunities for delete
  using (public.user_org_membership(organization_id));

create policy "Service role full access to opportunities"
  on public.opportunities for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');
