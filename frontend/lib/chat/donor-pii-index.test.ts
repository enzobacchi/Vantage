import { describe, expect, it } from "vitest"

import { loadDonorPiiIndex, type PiiIndexAdmin } from "./donor-pii-index"
import { ChatPIIRedactor } from "./pii-redactor"

type DonorRow = { display_name: string; email: string | null; phone: string | null }

/** Fake service-role client that, like PostgREST, never returns more than 1,000 rows per request. */
function fakeAdmin(total: number, opts: { failOnPage?: number } = {}) {
  const donors: DonorRow[] = Array.from({ length: total }, (_, i) => ({
    display_name: `Person${i} Surname${i}`,
    email: `person${i}@example.org`,
    phone: null,
  }))
  const calls: Array<{ orgId: string; ordered: string; from: number; to: number }> = []
  const admin = {
    from(table: string) {
      if (table !== "donors") throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: (_col: string, orgId: string) => ({
            order: (col: string) => ({
              range: (from: number, to: number) => {
                calls.push({ orgId, ordered: col, from, to })
                if (opts.failOnPage === calls.length) {
                  return Promise.resolve({ data: null, error: { message: "boom" } })
                }
                const capped = Math.min(to, from + 999)
                return Promise.resolve({ data: donors.slice(from, capped + 1), error: null })
              },
            }),
          }),
        }),
      }
    },
  }
  return { admin: admin as unknown as PiiIndexAdmin, calls }
}

describe("loadDonorPiiIndex", () => {
  it("returns every donor of an org larger than one page", async () => {
    const { admin, calls } = fakeAdmin(3000)
    const index = await loadDonorPiiIndex(admin, "org-1")
    expect(index).toHaveLength(3000)
    expect(calls.every((c) => c.orgId === "org-1" && c.ordered === "id")).toBe(true)
  })

  it("lets the redactor hide a donor past the 1,000th", async () => {
    const { admin } = fakeAdmin(3000)
    const redactor = new ChatPIIRedactor()
    redactor.seedFromDonors(await loadDonorPiiIndex(admin, "org-1"))
    const redacted = redactor.redactUserText("Had coffee with Person2400 Surname2400 today")
    expect(redacted).not.toContain("Person2400")
    expect(redacted).not.toContain("Surname2400")
  })

  it("throws instead of returning a partial list when a page fails", async () => {
    const { admin } = fakeAdmin(3000, { failOnPage: 2 })
    await expect(loadDonorPiiIndex(admin, "org-1")).rejects.toThrow("boom")
  })
})
