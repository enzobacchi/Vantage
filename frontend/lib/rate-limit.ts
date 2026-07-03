/**
 * Sliding-window rate limiter.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, limits
 * are enforced globally via Upstash Redis (REST API, no SDK dependency) using
 * a sorted-set sliding window — the same semantics as the in-memory limiter.
 *
 * When the env vars are absent, or the Redis call fails or times out
 * (~2s budget), we fall back to the in-memory sliding window below. On
 * Vercel serverless each instance gets its own memory, so the fallback
 * provides per-instance burst protection rather than a global limit — the
 * same behavior this module had before the Redis backend was added. A
 * degraded limiter never breaks requests.
 */

type RateLimitResult = { limited: false } | { limited: true; retryAfterMs: number }

// ---------------------------------------------------------------------------
// In-memory fallback (per-instance sliding window)
// ---------------------------------------------------------------------------

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

function checkRateLimitMemory(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
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

// ---------------------------------------------------------------------------
// Upstash Redis backend (global sliding window)
// ---------------------------------------------------------------------------

const REDIS_TIMEOUT_MS = 2_000

// Warn once per instance when Redis is configured but unreachable, then stay
// quiet — every request would otherwise log on an Upstash outage.
let warnedRedisUnavailable = false

type PipelineResult = { result?: unknown; error?: string }

async function redisPipeline(
  url: string,
  token: string,
  commands: (string | number)[][]
): Promise<PipelineResult[]> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Upstash pipeline failed with status ${res.status}`)
  const results = (await res.json()) as PipelineResult[]
  for (const r of results) {
    if (r.error) throw new Error(`Upstash command failed: ${r.error}`)
  }
  return results
}

async function checkRateLimitRedis(
  url: string,
  token: string,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const cutoff = now - windowMs
  // Unique member so concurrent requests in the same millisecond both count
  const member = `${now}-${Math.random().toString(36).slice(2)}`

  const results = await redisPipeline(url, token, [
    ["ZREMRANGEBYSCORE", key, 0, cutoff],
    ["ZADD", key, now, member],
    ["ZCARD", key],
    ["ZRANGE", key, 0, 0, "WITHSCORES"],
    ["PEXPIRE", key, windowMs],
  ])

  const count = Number(results[2]?.result)
  if (!Number.isFinite(count)) {
    throw new Error("Upstash returned an unexpected ZCARD result")
  }

  if (count > maxRequests) {
    // Blocked requests don't count toward the window (the in-memory limiter
    // only records allowed requests). Fire-and-forget — worst case the stray
    // member expires with the key.
    void redisPipeline(url, token, [["ZREM", key, member]]).catch(() => {})

    const oldestWithScore = results[3]?.result
    const oldest = Array.isArray(oldestWithScore)
      ? Number(oldestWithScore[1])
      : NaN
    const retryAfterMs = Number.isFinite(oldest)
      ? Math.max(oldest + windowMs - now, 0)
      : windowMs
    return { limited: true, retryAfterMs }
  }

  return { limited: false }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a request should be rate limited.
 *
 * @param key - Unique identifier (e.g., orgId + route)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { limited: true, retryAfterMs } if rate limited, { limited: false } otherwise
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (url && token) {
    try {
      return await checkRateLimitRedis(url, token, key, maxRequests, windowMs)
    } catch (error) {
      if (!warnedRedisUnavailable) {
        warnedRedisUnavailable = true
        console.warn(
          "[rate-limit] Upstash Redis unavailable — falling back to in-memory limiter:",
          error instanceof Error ? error.message : error
        )
      }
      // Fall through to the in-memory limiter
    }
  }

  return checkRateLimitMemory(key, maxRequests, windowMs)
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
