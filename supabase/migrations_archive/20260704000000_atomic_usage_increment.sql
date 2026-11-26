-- Atomic usage metering (audit 2026-07-04).
--
-- incrementUsage() in lib/subscription.ts did a read-then-update:
--   select count ...            -> update set count = count + 1
-- Two concurrent AI-insight / chat / donor requests both read count=N and both
-- wrote N+1, losing increments and letting an org exceed its paid plan limits.
--
-- This replaces that with a single atomic upsert. It relies on the existing
-- unique index idx_subscription_usage_unique (org_id, metric, period_start),
-- which backs the ON CONFLICT target. Returns the new count for observability.
--
-- Only the service-role client (which the app uses everywhere) needs to call
-- this, so execute is revoked from anon/authenticated.

create or replace function public.increment_usage(
  p_org_id uuid,
  p_metric text,
  p_period_start timestamptz,
  p_period_end timestamptz
) returns integer
language sql
security invoker
set search_path = ''
as $$
  insert into public.subscription_usage (org_id, metric, count, period_start, period_end)
  values (p_org_id, p_metric, 1, p_period_start, p_period_end)
  on conflict (org_id, metric, period_start)
  do update set count = public.subscription_usage.count + 1,
                updated_at = now()
  returning count;
$$;

revoke execute on function public.increment_usage(uuid, text, timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.increment_usage(uuid, text, timestamptz, timestamptz) to service_role;
