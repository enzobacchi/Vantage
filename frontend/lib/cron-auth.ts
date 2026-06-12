import { timingSafeEqual } from "node:crypto"

/**
 * Verify a cron request's `Authorization: Bearer <CRON_SECRET>` header with a
 * constant-time comparison (avoids leaking the secret via response timing).
 * Returns false if the secret isn't configured or the header doesn't match.
 */
export function isAuthorizedCron(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  if (!authHeader) return false

  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const got = Buffer.from(authHeader)
  // timingSafeEqual throws on length mismatch — guard first (the length itself
  // is not secret).
  if (expected.length !== got.length) return false
  return timingSafeEqual(expected, got)
}
