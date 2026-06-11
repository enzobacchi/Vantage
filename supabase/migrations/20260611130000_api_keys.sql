-- Per-org API keys for the public REST API (/api/v1).
--
-- key_hash is the hex SHA-256 of the full plaintext key. Plain SHA-256 (not
-- bcrypt) is deliberate: keys carry ~192 bits of entropy so brute force is
-- moot, and the hash must support an indexed exact-match lookup per request.
-- The plaintext is shown exactly once at creation and never stored.
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,           -- e.g. 'vk_live_3fa9' — display only
  scopes text[] NOT NULL DEFAULT '{read}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(org_id);
