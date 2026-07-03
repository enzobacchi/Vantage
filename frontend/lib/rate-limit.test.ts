import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit } from "./rate-limit"

// Unique key per test so the module-level in-memory store never bleeds state
// between tests.
let keyCounter = 0
function uniqueKey() {
  keyCounter += 1
  return `test-key-${keyCounter}`
}

beforeEach(() => {
  // Ensure the Upstash path is off unless a test opts in
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("in-memory rate limiting", () => {
  it("allows requests under the limit and blocks over it", async () => {
    const key = uniqueKey()

    for (let i = 0; i < 3; i++) {
      const rl = await checkRateLimit(key, 3, 60_000)
      expect(rl.limited).toBe(false)
    }

    const blocked = await checkRateLimit(key, 3, 60_000)
    expect(blocked.limited).toBe(true)
    if (blocked.limited) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0)
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000)
    }
  })

  it("allows requests again after the window resets", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const key = uniqueKey()

    expect((await checkRateLimit(key, 2, 1_000)).limited).toBe(false)
    expect((await checkRateLimit(key, 2, 1_000)).limited).toBe(false)
    expect((await checkRateLimit(key, 2, 1_000)).limited).toBe(true)

    // Advance past the sliding window — old timestamps expire
    vi.advanceTimersByTime(1_001)
    expect((await checkRateLimit(key, 2, 1_000)).limited).toBe(false)
  })

  it("does not call fetch when Upstash env vars are missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const rl = await checkRateLimit(uniqueKey(), 5, 60_000)
    expect(rl.limited).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("Upstash Redis rate limiting", () => {
  it("allows under the limit and blocks over it based on the pipeline result", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    const key = uniqueKey()
    const now = Date.now()

    // Pipeline result order: ZREMRANGEBYSCORE, ZADD, ZCARD, ZRANGE, PEXPIRE
    const pipelineResponse = (count: number, oldestScore: number) =>
      new Response(
        JSON.stringify([
          { result: 0 },
          { result: 1 },
          { result: count },
          { result: ["some-member", String(oldestScore)] },
          { result: 1 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(pipelineResponse(1, now)) // 1 <= 3 → allowed

    const allowed = await checkRateLimit(key, 3, 60_000)
    expect(allowed.limited).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toBe("https://fake.upstash.io/pipeline")
    const sentCommands = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(sentCommands[1][0]).toBe("ZADD")
    expect(sentCommands[1][1]).toBe(key)

    // 4 > 3 → blocked; the fire-and-forget ZREM triggers a second fetch
    fetchSpy.mockResolvedValue(pipelineResponse(4, now - 30_000))
    const blocked = await checkRateLimit(key, 3, 60_000)
    expect(blocked.limited).toBe(true)
    if (blocked.limited) {
      // oldest (now - 30s) + 60s window − now ≈ 30s
      expect(blocked.retryAfterMs).toBeGreaterThan(29_000)
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(30_000)
    }
  })

  it("falls back to the in-memory limiter when the Redis call fails", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ETIMEDOUT"))
    const key = uniqueKey()

    // Redis is down, but requests still get rate limited in memory
    expect((await checkRateLimit(key, 2, 60_000)).limited).toBe(false)
    expect((await checkRateLimit(key, 2, 60_000)).limited).toBe(false)
    expect((await checkRateLimit(key, 2, 60_000)).limited).toBe(true)
  })
})
