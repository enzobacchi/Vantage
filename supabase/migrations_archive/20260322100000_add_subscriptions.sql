-- Stripe billing: subscriptions table and stripe_customer_id on organizations.
-- Supports free trial -> paid plan flow with usage tracking.

-- Add Stripe customer ID to organizations for lookup
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

-- Subscription plans:
--   trial     = 14-day free trial (all features, 250 donors)
--   essentials = $39/mo — 1,000 donors, 3 seats, 50 AI insights/mo
--   growth    = $79/mo — 5,000 donors, 10 seats, unlimited AI insights
--   pro       = $149/mo — unlimited donors, unlimited seats, priority support

CREATE TABLE IF NOT EXISTS subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  plan_id         text NOT NULL DEFAULT 'trial',  -- trial | essentials | growth | pro
  status          text NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | canceled | unpaid
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_ends_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Each org should have at most one active subscription
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions(org_id);

-- Lookup by Stripe subscription ID (webhook handling)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- Track metered usage per billing period (AI insights, email sends, etc.)
CREATE TABLE IF NOT EXISTS subscription_usage (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric     text NOT NULL,  -- 'ai_insights' | 'email_sends' | 'donors'
  count      integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One usage row per org + metric + period
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_usage_unique
  ON subscription_usage(org_id, metric, period_start);

-- Enable RLS (admin client bypasses, but defense in depth)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_usage ENABLE ROW LEVEL SECURITY;
