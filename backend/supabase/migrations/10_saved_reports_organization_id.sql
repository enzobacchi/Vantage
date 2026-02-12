-- Scope saved_reports by organization (required by API insert).
alter table if exists public.saved_reports
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create index if not exists saved_reports_organization_id_idx on public.saved_reports (organization_id);
comment on column public.saved_reports.organization_id is 'Organization that owns this report; required for insert from generate route.';
