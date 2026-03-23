/**
 * Simple in-memory sliding-window rate limiter.
 *
 * On Vercel serverless, each instance gets its own memory, so this provides
 * per-instance burst protection — not a global rate limit. For global limits,
 * use a database-backed approach (like the email send log) or Upstash Redis.
 *
 * Good enough to block rapid-fire abuse from a single connection.
 */

type Entry = { timestamps: number[] }

const store = new Map<string, Entry>()

// Clean up stale entries every 60 seconds
const CLEANUP_INTERVAL = 60_000
let lastCleanup = Date.now()

function cleanup(windowMs: number) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  const cutoff = now - windowMs
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}

/**
 * Check if a request should be rate limited.
 *
 * @param key - Unique identifier (e.g., orgId + route)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { limited: true, retryAfterMs } if rate limited, { limited: false } otherwise
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { limited: false } | { limited: true; retryAfterMs: number } {
  cleanup(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs
  let entry = store.get(key)

  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0]
    const retryAfterMs = oldest + windowMs - now
    return { limited: true, retryAfterMs }
  }

  entry.timestamps.push(now)
  return { limited: false }
}

/**
 * Helper to return a 429 response.
 */
export function rateLimitResponse(retryAfterMs: number) {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000)
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      retryAfter: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    }
  )
}
