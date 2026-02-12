-- Sync tracking: store last successful sync time per org for incremental sync (CDC).
alter table public.organizations
  add column if not exists last_synced_at timestamptz;

comment on column public.organizations.last_synced_at is 'When the last QuickBooks sync completed; used for incremental sync (MetaData.LastUpdatedTime > last_synced_at).';
