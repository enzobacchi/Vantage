import { describe, expect, it } from "vitest"

import { bucketDate, enumerateBuckets } from "./timeseries"

describe("bucketDate", () => {
  it("buckets by day", () => {
    expect(bucketDate("2025-03-15", "day")).toBe("2025-03-15")
    expect(bucketDate("2025-01-01T23:59:59Z", "day")).toBe("2025-01-01")
  })

  it("buckets by month", () => {
    expect(bucketDate("2025-03-15", "month")).toBe("2025-03")
    expect(bucketDate("2025-12-31", "month")).toBe("2025-12")
  })

  it("buckets by quarter", () => {
    expect(bucketDate("2025-01-15", "quarter")).toBe("2025-Q1")
    expect(bucketDate("2025-04-01", "quarter")).toBe("2025-Q2")
    expect(bucketDate("2025-07-31", "quarter")).toBe("2025-Q3")
    expect(bucketDate("2025-10-01", "quarter")).toBe("2025-Q4")
  })

  it("buckets by year", () => {
    expect(bucketDate("2025-07-04", "year")).toBe("2025")
  })

  it("buckets by ISO week (Monday-start)", () => {
    // 2025-01-01 is a Wednesday → ISO week 1 of 2025
    expect(bucketDate("2025-01-01", "week")).toBe("2025-W01")
    // 2025-03-15 (Saturday) → ISO week 11
    expect(bucketDate("2025-03-15", "week")).toBe("2025-W11")
  })

  it("returns null for unparseable input", () => {
    expect(bucketDate("not-a-date", "day")).toBeNull()
  })
})

describe("enumerateBuckets", () => {
  it("enumerates months inclusively", () => {
    expect(enumerateBuckets("2025-01-15", "2025-04-10", "month")).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
    ])
  })

  it("enumerates quarters", () => {
    expect(enumerateBuckets("2025-01-01", "2025-12-31", "quarter")).toEqual([
      "2025-Q1",
      "2025-Q2",
      "2025-Q3",
      "2025-Q4",
    ])
  })

  it("enumerates years", () => {
    expect(enumerateBuckets("2023-06-01", "2025-02-15", "year")).toEqual([
      "2023",
      "2024",
      "2025",
    ])
  })

  it("enumerates days inclusive of endpoints", () => {
    expect(enumerateBuckets("2025-03-01", "2025-03-03", "day")).toEqual([
      "2025-03-01",
      "2025-03-02",
      "2025-03-03",
    ])
  })

  it("returns empty for inverted range", () => {
    expect(enumerateBuckets("2025-03-15", "2025-01-01", "month")).toEqual([])
  })

  it("returns empty for malformed dates", () => {
    expect(enumerateBuckets("garbage", "2025-01-01", "month")).toEqual([])
  })
})
