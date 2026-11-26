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

/** Every donor id of the org, paged by primary key. */
async function allDonorIds(orgId: string): Promise<string[]> {
  const ids: string[] = []
  let lastId = "00000000-0000-0000-0000-000000000000"
  for (;;) {
    const { data, error } = await admin.from("donors").select("id").eq("org_id", orgId).gt("id", lastId).order("id").limit(500)
    if (error) throw new Error(error.message)
    ids.push(...(data ?? []).map((d) => d.id as string))
    if ((data ?? []).length < 500) return ids
    lastId = ids[ids.length - 1]
  }
}

test("donor list date filter counts every donor who gave in the range", async ({ page }) => {
  const orgId = await sampleOrgId()
  const from = `${new Date().getFullYear() - 2}-01-01`
  const to = `${new Date().getFullYear()}-12-31`

  // Truth: distinct donors with positive giving in the range, paged by id.
  const totals = new Map<string, number>()
  let lastId = "00000000-0000-0000-0000-000000000000"
  for (;;) {
    const { data, error } = await admin
      .from("donations")
      .select("id, donor_id, amount")
      .eq("org_id", orgId)
      .gte("date", from)
      .lte("date", to)
      .gt("id", lastId)
      .order("id")
      .limit(500)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) totals.set(row.donor_id, (totals.get(row.donor_id) ?? 0) + Number(row.amount ?? 0))
    if ((data ?? []).length < 500) break
    lastId = String(data![data!.length - 1].id)
  }
  const expected = [...totals.values()].filter((v) => v > 0).length
  expect(expected).toBeGreaterThan(1000)

  const res = await page.request.get(`/api/donors?from=${from}&to=${to}&limit=50`)
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.total).toBe(expected)
  expect(body.donors).toHaveLength(50)
})

test("donor list tag filter works for a tag on 1,500 donors", async ({ page }) => {
  const orgId = await sampleOrgId()
  const donorIds = (await allDonorIds(orgId)).slice(0, 1500)
  const { data: tag, error: tagError } = await admin
    .from("tags")
    .insert({ organization_id: orgId, name: `scale-test-${Date.now()}`, color: "gray" })
    .select("id")
    .single()
  if (tagError || !tag) throw new Error(tagError?.message ?? "tag insert failed")

  try {
    for (let i = 0; i < donorIds.length; i += 500) {
      const { error } = await admin
        .from("donor_tags")
        .insert(donorIds.slice(i, i + 500).map((donor_id) => ({ donor_id, tag_id: tag.id })))
      if (error) throw new Error(error.message)
    }

    const res = await page.request.get(`/api/donors?tagIds=${tag.id}&limit=50`)
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.total).toBe(1500)
    expect(body.donors).toHaveLength(50)
    expect(body.donors[0].tags.map((t: { id: string }) => t.id)).toContain(tag.id)

    const from = `${new Date().getFullYear() - 2}-01-01`
    const to = `${new Date().getFullYear()}-12-31`
    const dated = await page.request.get(`/api/donors?tagIds=${tag.id}&from=${from}&to=${to}&limit=50`)
    expect(dated.ok()).toBe(true)
    const datedBody = await dated.json()
    expect(datedBody.total).toBeGreaterThan(500)
    expect(datedBody.total).toBeLessThanOrEqual(1500)
  } finally {
    await admin.from("tags").delete().eq("id", tag.id) // cascades donor_tags
  }
})
