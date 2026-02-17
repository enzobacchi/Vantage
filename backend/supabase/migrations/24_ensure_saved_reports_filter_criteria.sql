-- Ensure saved_reports has filter_criteria (required for CRM-saved reports).
-- Safe when the table was created with or without this column.

alter table if exists public.saved_reports
  add column if not exists filter_criteria jsonb not null default '{}'::jsonb;

comment on column public.saved_reports.filter_criteria is 'JSON criteria for report (e.g. CRM filters: search, tagIds, lifecycleConfig).';
