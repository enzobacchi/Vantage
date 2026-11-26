-- Gmail OAuth "send as" integration.
-- Per-user credential storage with encrypted tokens (AES-256-GCM, app-layer).
-- Each staff member connects their own Google Workspace / Gmail account so
-- donor emails come from the user's real address (not the Vantage domain).

create table if not exists public.gmail_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  google_email text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz,
  scope text not null default 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
  needs_reauth boolean not null default false,
  last_send_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id)
);

create index if not exists gmail_credentials_org_idx on public.gmail_credentials(org_id);
create index if not exists gmail_credentials_user_idx on public.gmail_credentials(user_id);

alter table public.gmail_credentials enable row level security;

drop policy if exists "gmail_credentials_self_read" on public.gmail_credentials;
create policy "gmail_credentials_self_read"
  on public.gmail_credentials for select
  using (user_id = auth.uid());

drop policy if exists "gmail_credentials_admin_read" on public.gmail_credentials;
create policy "gmail_credentials_admin_read"
  on public.gmail_credentials for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = gmail_credentials.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- All writes happen via the service-role admin client. No write policies.

-- email_send_log was created outside migrations; ensure it exists with the
-- shape we rely on, then add a user_id column so rate-limits can scope
-- per-user (Gmail sends are per-user now, not per-org).
create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.email_send_log
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists email_send_log_user_hour_idx
  on public.email_send_log (user_id, sent_at desc);
create index if not exists email_send_log_org_hour_idx
  on public.email_send_log (org_id, sent_at desc);
