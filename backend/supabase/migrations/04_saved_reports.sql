-- Saved reports for in-app reporting (Phase 4 Feature D - revised)

create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filter_criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

