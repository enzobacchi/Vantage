-- Expo push tokens for mobile notifications (POST /api/push-token).
-- One row per device token; re-registration moves a token to the current
-- user/org (device handoff, re-login).

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_org_idx on public.push_tokens(org_id);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

-- Service-role access only (deny-by-default for anon/authenticated, same
-- posture as the rest of the schema after the RLS lockdown migration).
alter table public.push_tokens enable row level security;
