-- Add org_id to chat_history for multi-tenant scoping.
-- If chat_history doesn't exist, create it with org_id.
-- If it exists, add org_id column.

create table if not exists public.chat_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  session_id text,
  created_at timestamptz not null default now()
);

-- Add org_id column if table existed without it
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chat_history')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_history' and column_name = 'org_id')
  then
    alter table public.chat_history add column org_id uuid references public.organizations(id) on delete cascade;
  end if;
end $$;

create index if not exists chat_history_org_id_idx on public.chat_history (org_id);
create index if not exists chat_history_session_id_idx on public.chat_history (session_id);
create index if not exists chat_history_created_at_idx on public.chat_history (created_at desc);
