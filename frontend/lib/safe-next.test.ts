import { describe, expect, it } from "vitest"
import { safeNext } from "./safe-next"

describe("safeNext", () => {
  it("keeps same-origin paths, including query strings", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard")
    expect(safeNext("/join?token=abc123")).toBe("/join?token=abc123")
    expect(safeNext("/reset-password")).toBe("/reset-password")
  })

  it("falls back for missing values", () => {
    expect(safeNext(null)).toBe("/dashboard")
    expect(safeNext(undefined)).toBe("/dashboard")
    expect(safeNext("")).toBe("/dashboard")
  })

  it("rejects anything that could leave the site", () => {
    for (const evil of [
      "https://evil.example",
      "http://evil.example/dashboard",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "/\n/evil.example",
      "evil.example",
    ]) {
      expect(safeNext(evil)).toBe("/dashboard")
    }
  })

  it("uses the caller's fallback", () => {
    expect(safeNext("https://evil.example", "/login")).toBe("/login")
  })
})
