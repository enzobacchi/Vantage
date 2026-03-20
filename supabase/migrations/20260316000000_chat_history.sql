-- Chat history for AI chat agent
create table public.chat_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tool_invocations jsonb,
  created_at timestamptz not null default now()
);

create index idx_chat_history_org_user on public.chat_history(org_id, user_id, created_at desc);
alter table public.chat_history enable row level security;
