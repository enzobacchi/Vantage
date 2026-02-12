-- Multi-tenant RLS: users can only access rows for organizations they belong to.
-- Enables RLS on organizations, donors, donations, donor_notes and adds membership-based policies.

-- Helper: true if the current user is a member of the given organization
create or replace function public.user_org_membership(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
  );
$$;

-- ----------
-- organizations: user can see an org only if they are a member
-- ----------
alter table public.organizations enable row level security;

create policy "Users can select organizations they belong to"
  on public.organizations for select
  using (public.user_org_membership(id));

-- Service role must still manage orgs (QB callback, sync, etc.)
create policy "Service role full access to organizations"
  on public.organizations for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');

-- ----------
-- donors: user can access only donors in their org (org_id)
-- ----------
alter table public.donors enable row level security;

create policy "Users can select donors in their org"
  on public.donors for select
  using (public.user_org_membership(org_id));

create policy "Users can insert donors in their org"
  on public.donors for insert
  with check (public.user_org_membership(org_id));

create policy "Users can update donors in their org"
  on public.donors for update
  using (public.user_org_membership(org_id))
  with check (public.user_org_membership(org_id));

create policy "Users can delete donors in their org"
  on public.donors for delete
  using (public.user_org_membership(org_id));

create policy "Service role full access to donors"
  on public.donors for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');

-- ----------
-- donations: access via donor's org (donor_id -> donors.org_id)
-- ----------
alter table public.donations enable row level security;

create policy "Users can select donations for donors in their org"
  on public.donations for select
  using (
    exists (
      select 1 from public.donors d
      where d.id = donations.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can insert donations for donors in their org"
  on public.donations for insert
  with check (
    exists (
      select 1 from public.donors d
      where d.id = donations.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can update donations for donors in their org"
  on public.donations for update
  using (
    exists (
      select 1 from public.donors d
      where d.id = donations.donor_id
        and public.user_org_membership(d.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.donors d
      where d.id = donations.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can delete donations for donors in their org"
  on public.donations for delete
  using (
    exists (
      select 1 from public.donors d
      where d.id = donations.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Service role full access to donations"
  on public.donations for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');

-- ----------
-- donor_notes: access via donor's org (donor_id -> donors.org_id)
-- ----------
alter table public.donor_notes enable row level security;

create policy "Users can select donor_notes for donors in their org"
  on public.donor_notes for select
  using (
    exists (
      select 1 from public.donors d
      where d.id = donor_notes.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can insert donor_notes for donors in their org"
  on public.donor_notes for insert
  with check (
    exists (
      select 1 from public.donors d
      where d.id = donor_notes.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can update donor_notes for donors in their org"
  on public.donor_notes for update
  using (
    exists (
      select 1 from public.donors d
      where d.id = donor_notes.donor_id
        and public.user_org_membership(d.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.donors d
      where d.id = donor_notes.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can delete donor_notes for donors in their org"
  on public.donor_notes for delete
  using (
    exists (
      select 1 from public.donors d
      where d.id = donor_notes.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Service role full access to donor_notes"
  on public.donor_notes for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');

comment on function public.user_org_membership(uuid) is 'Returns true if auth.uid() is a member of the given organization; used by RLS policies.';
