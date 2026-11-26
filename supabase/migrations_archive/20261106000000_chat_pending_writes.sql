-- Server-side half of the chat write-confirm gate (frontend/lib/chat/confirm-gate.ts).
-- When chat previews a write (create_donor / create_donation), the server
-- records a hash of that exact change here, and marks it ready once that
-- request has finished streaming. On the user's next chat message the route
-- takes (deletes) that user's ready rows; each can approve one write in that
-- request. Rows from a request still in flight are left alone. So a write
-- needs a preview from an earlier, finished request, is single-use, and works
-- for clients that replay history as text only (mobile, reloaded web chat).
--
-- key_hash is a SHA-256 of the change, never the donor details themselves.
-- Additive only. Idempotent.

create table if not exists public.chat_pending_writes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  key_hash text not null,
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists chat_pending_writes_org_user_idx
  on public.chat_pending_writes(org_id, user_id);

-- Service-role access only (deny-by-default for anon/authenticated, same
-- posture as the rest of the schema after the RLS lockdown migration).
alter table public.chat_pending_writes enable row level security;
