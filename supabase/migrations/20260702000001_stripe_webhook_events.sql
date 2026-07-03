-- P2-B: Stripe webhook idempotency + ordering.
-- Every verified webhook event claims a row here before processing; the
-- primary key makes duplicate deliveries no-ops, and event_created lets the
-- handler skip out-of-order subscription events (e.g. a delayed `updated`
-- arriving after `deleted`).

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_subscription_id text,
  event_created timestamptz not null,
  processed_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_sub_created_idx
  on public.stripe_webhook_events (stripe_subscription_id, event_created desc);

-- Deny-by-default: only the service-role client (which bypasses RLS) touches
-- this table. No policies on purpose.
alter table public.stripe_webhook_events enable row level security;
