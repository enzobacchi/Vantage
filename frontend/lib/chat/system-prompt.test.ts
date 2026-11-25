import { afterEach, describe, expect, it, vi } from "vitest"

import { buildSystemPrompt } from "./system-prompt"

describe("buildSystemPrompt dates", () => {
  afterEach(() => vi.useRealTimers())

  // 00:51 UTC on Fri Oct 30 is still Thu Oct 29 in Chicago.
  const instant = new Date("2026-10-30T00:51:00Z")

  it("uses the user's time zone for today's date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(instant)
    const prompt = buildSystemPrompt("org", "America/Chicago")
    expect(prompt).toContain("Today's date: 2026-10-29 (Thursday)")
  })

  it("lists the next seven days with weekday names", () => {
    vi.useFakeTimers()
    vi.setSystemTime(instant)
    const prompt = buildSystemPrompt("org", "America/Chicago")
    expect(prompt).toContain("Friday 2026-10-30")
    expect(prompt).toContain("Thursday 2026-11-05")
  })

  it("falls back to UTC for a missing or invalid time zone", () => {
    vi.useFakeTimers()
    vi.setSystemTime(instant)
    expect(buildSystemPrompt("org")).toContain("Today's date: 2026-10-30 (Friday)")
    expect(buildSystemPrompt("org", "Not/AZone")).toContain("Today's date: 2026-10-30 (Friday)")
  })

  it("tells the model to search with placeholders from the user's own message", () => {
    expect(buildSystemPrompt("org")).toContain('search_donors({ query: "[DONOR_31]" })')
  })
})
