-- Add created_at for "most recent org" fallback in sync.
alter table public.organizations
  add column if not exists created_at timestamptz not null default now();

comment on column public.organizations.created_at is 'Set on insert; used for fallback org lookup (ORDER BY created_at DESC).';
