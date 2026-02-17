-- Report folders for organizing saved reports

create table if not exists public.report_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade
);

create index if not exists report_folders_organization_id_idx on public.report_folders (organization_id);

alter table if exists public.saved_reports
  add column if not exists folder_id uuid references public.report_folders(id) on delete set null;

create index if not exists saved_reports_folder_id_idx on public.saved_reports (folder_id);
