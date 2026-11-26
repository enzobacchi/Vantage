-- Idempotency marker for the "trial ends in 7 days" reminder cron.
-- Stamped when the T-7 reminder email is sent so the cron can't double-send.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz;

-- Partial index to make the cron query fast: only scan trialing rows that haven't
-- received the reminder yet.
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_reminder_pending
  ON subscriptions(trial_ends_at)
  WHERE status = 'trialing' AND trial_reminder_sent_at IS NULL;
