-- Ensure saved_reports exists with all columns needed for upload and list/preview.
-- Safe to run on fresh DB or when 04/09/10 were already applied (uses if not exists / add column if not exists).

create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filter_criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.saved_reports
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists summary text,
  add column if not exists query text,
  add column if not exists records_count integer,
  add column if not exists type text default 'static',
  add column if not exists content text;

create index if not exists saved_reports_organization_id_idx on public.saved_reports (organization_id);
