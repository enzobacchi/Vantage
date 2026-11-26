import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

/**
 * Correctness at 3,000 donors. The numbers the app shows must equal a direct
 * sum over every row in the database — not just the first 1,000 that a single
 * PostgREST request returns.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

async function sampleOrgId(): Promise<string> {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("name", "Sample Outreach (Local)")
    .single()
  if (error || !data) throw new Error("Sample org not seeded: run scripts/seed-sample-org.ts")
  return data.id as string
}

/** Independent of the app's own paging helper: pages by primary key. */
async function sumColumn(
  table: "donors" | "donations",
  column: string,
  orgId: string,
  sinceDate?: string
): Promise<{ sum: number; rows: number }> {
  let sum = 0
  let rows = 0
  let lastId = "00000000-0000-0000-0000-000000000000"
  for (;;) {
    let query = admin.from(table).select(`id, ${column}`).eq("org_id", orgId).gt("id", lastId).order("id").limit(500)
    if (sinceDate) query = query.gte("date", sinceDate)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const page = (data ?? []) as unknown as Array<Record<string, unknown>>
    for (const row of page) sum += Number(row[column] ?? 0)
    rows += page.length
    if (page.length < 500) return { sum, rows }
    lastId = String(page[page.length - 1].id)
  }
}

test("dashboard totals equal a direct database sum", async ({ page }) => {
  const orgId = await sampleOrgId()
  const lifetime = await sumColumn("donors", "total_lifetime_value", orgId)
  const ytd = await sumColumn("donations", "amount", orgId, `${new Date().getFullYear()}-01-01`)
  expect(lifetime.rows).toBeGreaterThan(1000)
  expect(ytd.rows).toBeGreaterThan(1000)

  const res = await page.request.get("/api/dashboard/metrics")
  expect(res.ok()).toBe(true)
  const metrics = await res.json()
  expect(metrics.totalDonors).toBe(lifetime.rows)
  expect(metrics.totalRevenue).toBeCloseTo(lifetime.sum, 2)
  expect(metrics.ytdRevenue).toBeCloseTo(ytd.sum, 2)
})

test("twelve-month trend adds up to every gift in the window", async ({ page }) => {
  const orgId = await sampleOrgId()
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 10)
  const expected = await sumColumn("donations", "amount", orgId, start)
  expect(expected.rows).toBeGreaterThan(1000)

  const res = await page.request.get("/api/donations/trend")
  expect(res.ok()).toBe(true)
  const points = (await res.json()) as Array<{ total: number }>
  expect(points).toHaveLength(12)
  expect(points.reduce((s, p) => s + p.total, 0)).toBeCloseTo(expected.sum, 2)
})

test("tasks view lists the organisation's pending tasks", async ({ page }) => {
  await page.goto("/dashboard?view=tasks")
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible()
  await expect(page.getByText(/^Follow up with /).first()).toBeVisible()
  await expect(page.getByText("No pending tasks")).toHaveCount(0)
})
