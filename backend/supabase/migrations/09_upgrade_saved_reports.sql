-- Upgrade saved_reports for API: summary, query, records_count, type, content.
-- Matches app/api/reports/generate and app/api/reports/create insert payloads.

alter table if exists public.saved_reports
  add column if not exists summary text,
  add column if not exists query text,
  add column if not exists records_count integer,
  add column if not exists type text default 'static',
  add column if not exists content text;

comment on column public.saved_reports.summary is 'Human-readable report criteria (e.g. Donors in Michigan).';
comment on column public.saved_reports.query is 'SQL or filter description; null for text-to-query reports.';
comment on column public.saved_reports.records_count is 'Number of rows in the report.';
comment on column public.saved_reports.type is 'Report type: CSV, QUERY, or static.';
comment on column public.saved_reports.content is 'Report body (e.g. CSV text).';
