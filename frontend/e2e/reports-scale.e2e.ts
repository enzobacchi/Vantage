import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { runFilterQuery } from "@/lib/reports/run-filter-query"

/**
 * The report builder's query, run directly against the local 3,000-donor
 * sample org. No browser needed: this checks rows are not cut at 1,000 and
 * that filters matching thousands of donors still work.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

async function sampleOrgId(): Promise<string> {
  const { data } = await admin.from("organizations").select("id").eq("name", "Sample Outreach (Local)").single()
  if (!data) throw new Error("Sample org not seeded")
  return data.id as string
}

/** Distinct donors with a gift in [from, to], paged by primary key. */
async function donorsWhoGave(orgId: string, from: string, to: string): Promise<Set<string>> {
  const ids = new Set<string>()
  let lastId = "00000000-0000-0000-0000-000000000000"
  for (;;) {
    const { data, error } = await admin
      .from("donations")
      .select("id, donor_id")
      .eq("org_id", orgId)
      .gte("date", from)
      .lte("date", to)
      .gt("id", lastId)
      .order("id")
      .limit(500)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) ids.add(r.donor_id as string)
    if ((data ?? []).length < 500) return ids
    lastId = String(data![data!.length - 1].id)
  }
}

const year = new Date().getFullYear()
const from = `${year - 2}-01-01`
const to = `${year}-12-31`

test("an unfiltered report returns every donor", async () => {
  const orgId = await sampleOrgId()
  const { count } = await admin.from("donors").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  const result = await runFilterQuery({ orgId, filters: [], selectedColumns: ["display_name"] })
  expect(count).toBeGreaterThan(1000)
  expect(result.rowCount).toBe(count)
  expect(new Set(result.rows.map((r) => r.id)).size).toBe(count)
})

test("'gave between' matches every donor who gave in the range", async () => {
  const orgId = await sampleOrgId()
  const expected = await donorsWhoGave(orgId, from, to)
  expect(expected.size).toBeGreaterThan(1000)
  const result = await runFilterQuery({
    orgId,
    filters: [{ field: "donation_activity", operator: "gave_between", value: from, value2: to }],
    selectedColumns: ["display_name"],
  })
  expect(result.rowCount).toBe(expected.size)
})

test("'no gift between' excludes every donor who gave in the range", async () => {
  const orgId = await sampleOrgId()
  const gave = await donorsWhoGave(orgId, from, to)
  const { count } = await admin.from("donors").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  const result = await runFilterQuery({
    orgId,
    filters: [{ field: "donation_activity", operator: "no_gift_between", value: from, value2: to }],
    selectedColumns: ["display_name"],
  })
  expect(result.rowCount).toBe((count ?? 0) - gave.size)
  expect(result.rows.some((r) => gave.has(r.id as string))).toBe(false)
})

test("a gift-count filter counts every gift of the matching donors", async () => {
  const orgId = await sampleOrgId()
  const result = await runFilterQuery({
    orgId,
    filters: [{ field: "gift_count", operator: "gte", value: 1 }],
    selectedColumns: ["display_name"],
  })
  const { data: all } = await admin.from("donors").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  void all
  const everGave = await donorsWhoGave(orgId, "1900-01-01", "2999-12-31")
  expect(result.rowCount).toBe(everGave.size)
})
