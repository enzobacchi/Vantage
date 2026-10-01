-- Audit hardening (code audit follow-up, 2026-07-05).
--
-- Groups the DB-side items from docs/AUDIT-2026-07.md:
--   1. Atomic email-quota RPC (fixes the check-then-act race in the email routes).
--   2. Drop 5 duplicate indexes (zero-risk).
--   3. Add the missing covering index on donors.assigned_to.
--   4. Drop the redundant "Service role full access" policies. The service_role
--      bypasses RLS entirely, so these never execute for it, but they overlapped
--      anon/authenticated on every action (140 multiple_permissive_policies) and
--      re-evaluated auth.jwt() per row (auth_rls_initplan). Dropping them is
--      behaviourally inert and clears both advisor classes.
--   5. Wrap auth.uid() as (select auth.uid()) in the remaining user policies so
--      it is evaluated once per query, not once per row.
--   6. Give pledges the same org-scoped user policies as its sibling donor-data
--      tables (donors/donations), for defense-in-depth consistency.

-- ── 1. Atomic email quota ────────────────────────────────────────────────────
-- Serializes the count-then-insert per user with a transaction advisory lock so
-- two concurrent sends can't both slip under the hourly cap. Reserves the slot
-- (inserts) only when under the limit; returns whether the caller may send.
create or replace function public.try_consume_email_quota(
  p_user_id uuid,
  p_org_id uuid,
  p_limit integer,
  p_window interval
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into used
  from public.email_send_log
  where user_id = p_user_id
    and sent_at >= now() - p_window;

  if used >= p_limit then
    return false;
  end if;

  insert into public.email_send_log (org_id, user_id, sent_at)
  values (p_org_id, p_user_id, now());

  return true;
end;
$$;

revoke execute on function public.try_consume_email_quota(uuid, uuid, integer, interval) from anon, authenticated;
grant execute on function public.try_consume_email_quota(uuid, uuid, integer, interval) to service_role;

-- ── 2. Drop duplicate indexes (keep the <table>_<col>_idx of each pair) ───────
drop index if exists public.idx_donor_notes_donor_id;
drop index if exists public.idx_donor_tags_donor_id;
drop index if exists public.idx_donor_tags_tag_id;
drop index if exists public.idx_interactions_donor_id;
drop index if exists public.idx_opportunities_donor_id;

-- ── 3. Covering index for the donors.assigned_to foreign key ─────────────────
create index if not exists idx_donors_assigned_to on public.donors (assigned_to);

-- ── 4. Drop redundant service-role policies (service_role bypasses RLS) ───────
drop policy if exists "Service role full access to donations" on public.donations;
drop policy if exists "Service role full access to donors" on public.donors;
drop policy if exists "Service role full access to donor_notes" on public.donor_notes;
drop policy if exists "Service role full access to interactions" on public.interactions;
drop policy if exists "Service role full access to opportunities" on public.opportunities;
drop policy if exists "Service role full access to organizations" on public.organizations;
drop policy if exists "Service role full access" on public.organization_members;
drop policy if exists "Service role full access to saved_lists" on public.saved_lists;
drop policy if exists "Service role full access to invitations" on public.invitations;
drop policy if exists "Service role full access to user_feedback" on public.user_feedback;

-- ── 5. Wrap auth.uid() so it is evaluated once per query, not per row ─────────
alter policy "Users can read own memberships" on public.organization_members
  using ((select auth.uid()) = user_id);

alter policy "gmail_credentials_self_read" on public.gmail_credentials
  using (user_id = (select auth.uid()));

alter policy "gmail_credentials_admin_read" on public.gmail_credentials
  using (exists (
    select 1 from organization_members m
    where m.organization_id = gmail_credentials.org_id
      and m.user_id = (select auth.uid())
      and m.role = any (array['owner'::text, 'admin'::text])
  ));

alter policy "Users can select own feedback" on public.user_feedback
  using ((select auth.uid()) = user_id);

alter policy "Users can insert feedback for their org" on public.user_feedback
  with check (user_org_membership(organization_id) and ((select auth.uid()) = user_id));

-- ── 6. pledges: org-scoped user policies (parity with donors/donations) ───────
drop policy if exists "Users can select pledges in their org" on public.pledges;
drop policy if exists "Users can insert pledges in their org" on public.pledges;
drop policy if exists "Users can update pledges in their org" on public.pledges;
drop policy if exists "Users can delete pledges in their org" on public.pledges;

create policy "Users can select pledges in their org" on public.pledges
  for select using (user_org_membership(org_id));
create policy "Users can insert pledges in their org" on public.pledges
  for insert with check (user_org_membership(org_id));
create policy "Users can update pledges in their org" on public.pledges
  for update using (user_org_membership(org_id)) with check (user_org_membership(org_id));
create policy "Users can delete pledges in their org" on public.pledges
  for delete using (user_org_membership(org_id));
