-- Tasks (to-do) per organization. API uses service role and filters by organization_id.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete cascade
);

create index if not exists tasks_organization_id_idx on public.tasks (organization_id);
create index if not exists tasks_created_at_idx on public.tasks (created_at desc);

alter table public.tasks enable row level security;

-- Only service_role (API) can access; anon/authenticated have no policy so see nothing.
create policy "Service role full access to tasks"
  on public.tasks
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.tasks is 'Per-organization to-do list; scoped by organization_id in API.';
