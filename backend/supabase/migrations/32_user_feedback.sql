-- User feedback for bugs, feature requests, and general feedback.
-- Automatically scoped by organization_id and user_id; RLS enforces access.
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('bug', 'feature_request', 'general')),
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_organization_id_idx on public.user_feedback (organization_id);
create index if not exists user_feedback_user_id_idx on public.user_feedback (user_id);
create index if not exists user_feedback_created_at_idx on public.user_feedback (created_at desc);

alter table public.user_feedback enable row level security;

-- Users can insert feedback where organization_id matches their membership and user_id is self
create policy "Users can insert feedback for their org"
  on public.user_feedback for insert
  with check (
    public.user_org_membership(organization_id)
    and auth.uid() = user_id
  );

-- Users can select only their own feedback
create policy "Users can select own feedback"
  on public.user_feedback for select
  using (auth.uid() = user_id);

-- Service role full access (for admin/internal tools)
create policy "Service role full access to user_feedback"
  on public.user_feedback for all
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');

comment on table public.user_feedback is 'In-app user feedback (bugs, feature requests, general). Scoped by org; users see only their own submissions.';
comment on column public.user_feedback.status is 'Internal tracking: new, reviewed, resolved, etc.';
