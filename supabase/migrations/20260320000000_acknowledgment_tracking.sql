-- Add "sent by" tracking for donation acknowledgments.
-- The acknowledgment_sent_at column already exists on donations.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS acknowledgment_sent_by text;
