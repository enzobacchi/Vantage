-- Tags: custom colored badges per organization (e.g. Board Member, Volunteer).
-- donor_tags: junction table linking donors to tags.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default 'gray',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists tags_organization_id_idx on public.tags (organization_id);

create table if not exists public.donor_tags (
  donor_id uuid not null references public.donors(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (donor_id, tag_id)
);

create index if not exists donor_tags_donor_id_idx on public.donor_tags (donor_id);
create index if not exists donor_tags_tag_id_idx on public.donor_tags (tag_id);

-- RLS: tags are scoped by organization
alter table public.tags enable row level security;

create policy "Users can select tags in their org"
  on public.tags for select
  using (public.user_org_membership(organization_id));

create policy "Users can insert tags in their org"
  on public.tags for insert
  with check (public.user_org_membership(organization_id));

create policy "Users can update tags in their org"
  on public.tags for update
  using (public.user_org_membership(organization_id))
  with check (public.user_org_membership(organization_id));

create policy "Users can delete tags in their org"
  on public.tags for delete
  using (public.user_org_membership(organization_id));

-- RLS: donor_tags — access if user can see the donor
alter table public.donor_tags enable row level security;

create policy "Users can select donor_tags for donors in their org"
  on public.donor_tags for select
  using (
    exists (
      select 1 from public.donors d
      where d.id = donor_tags.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

create policy "Users can insert donor_tags for donors in their org"
  on public.donor_tags for insert
  with check (
    exists (
      select 1 from public.donors d
      where d.id = donor_tags.donor_id
        and public.user_org_membership(d.org_id)
    )
    and exists (
      select 1 from public.tags t
      where t.id = donor_tags.tag_id
        and public.user_org_membership(t.organization_id)
    )
  );

create policy "Users can delete donor_tags for donors in their org"
  on public.donor_tags for delete
  using (
    exists (
      select 1 from public.donors d
      where d.id = donor_tags.donor_id
        and public.user_org_membership(d.org_id)
    )
  );

comment on table public.tags is 'Custom tags per organization (e.g. Board Member, Volunteer).';
comment on table public.donor_tags is 'Junction: donors can have many tags.';
