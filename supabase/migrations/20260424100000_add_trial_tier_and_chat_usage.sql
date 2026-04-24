-- Conference readiness: trial tier selection + monthly chat message metering.
--
-- trial_tier: stores the plan size the user picked at signup (small / medium / large)
-- so isLimitExceeded() can resolve donor and AI limits from the selected tier
-- while plan_id stays "trial" (billing status).
--
-- subscription_usage.metric now also tracks chat_messages per month.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_tier text
    CHECK (trial_tier IS NULL OR trial_tier IN ('essentials', 'growth', 'pro'));

-- No schema change needed for subscription_usage; metric column is free-text.
-- Prior rows used 'ai_insights' | 'email_sends' | 'donors'. We now also write
-- 'chat_messages'. The unique (org_id, metric, period_start) index still holds.
