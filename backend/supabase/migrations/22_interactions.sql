-- CRM: interactions (calls, emails, meetings, notes, tasks) per donor
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donors(id) on delete cascade,
  type text not null check (type in ('email', 'call', 'meeting', 'note', 'task')),
  direction text check (direction in ('inbound', 'outbound')),
  subject text,
  content text not null default '',
  date timestamptz not null default now(),
  status text check (status is null or status in ('pending', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists interactions_donor_id_idx on public.interactions(donor_id);
create index if not exists interactions_date_idx on public.interactions(date desc);
create index if not exists interactions_created_at_idx on public.interactions(created_at desc);

comment on table public.interactions is 'CRM interactions and tasks per donor (calls, emails, meetings, notes, tasks).';

alter table public.interactions enable row level security;

-- Access via donor's org (same pattern as donor_notes)
create policy "Users can select interactions for donors in their org"
  on public.interactions for select
  using (
    exists (
      select 1 from public.donors d
      where d.id = interactions.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can insert interactions for donors in their org"
  on public.interactions for insert
  with check (
    exists (
      select 1 from public.donors d
      where d.id = interactions.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can update interactions for donors in their org"
  on public.interactions for update
  using (
    exists (
      select 1 from public.donors d
      where d.id = interactions.donor_id
        and public.user_org_membership(d.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.donors d
      where d.id = interactions.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can delete interactions for donors in their org"
  on public.interactions for delete
  using (
    exists (
      select 1 from public.donors d
      where d.id = interactions.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Service role full access to interactions"
  on public.interactions for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');
