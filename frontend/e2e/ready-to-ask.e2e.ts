import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { logTouchpoint } from "@/lib/meter/log-touchpoint"

/** The Ready to ask card on Home and the meter column in the donor list. */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

let donor: { id: string; org_id: string }
const created: string[] = []

async function cleanup() {
  if (created.length) await admin.from("interactions").delete().in("id", created)
  created.length = 0
  await admin.from("interactions").update({ points: 0 }).eq("donor_id", donor.id).gt("points", 0)
  await admin.from("meter_asks").delete().eq("donor_id", donor.id)
  await admin.from("donor_meters").delete().eq("donor_id", donor.id)
}

test.beforeAll(async () => {
  const { data: org } = await admin.from("organizations").select("id").eq("name", "Sample Outreach (Local)").single()
  if (!org) throw new Error("Sample org not seeded")
  const { data } = await admin
    .from("donors")
    .select("id, org_id")
    .eq("org_id", org.id)
    .eq("display_name", "John Underhill")
    .order("total_lifetime_value", { ascending: false })
    .limit(1)
    .single()
  donor = data as { id: string; org_id: string }
  await admin.from("org_features").upsert(
    ["quick_log", "touchpoint_meter"].map((feature_key) => ({ org_id: org.id, feature_key, enabled: true })),
    { onConflict: "org_id,feature_key" }
  )
  await cleanup()
  for (const kind of ["coffee", "visit"]) {
    const result = await logTouchpoint(admin, { orgId: donor.org_id, userId: null, donorId: donor.id, kind })
    if (!result.ok) throw new Error(result.message)
    created.push(result.interaction.id)
  }
})
test.afterAll(cleanup)

test("Home lists a donor whose meter is full as ready for an ask", async ({ page }) => {
  await page.goto("/dashboard")
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Ready to ask" }).first()
  const row = card.getByRole("listitem").filter({ has: page.locator(`a[href="/dashboard/donors/${donor.id}"]`) })
  await expect(row).toContainText("John Underhill")
  await expect(row).toContainText("Ready for an ask")
  await expect(row.getByRole("meter")).toHaveAttribute("aria-valuetext", "100 of 80 points, ready to ask")

  // Narrowing to an owner with no donors empties the list; "Unassigned" brings the donor back.
  await card.getByRole("combobox", { name: "Relationship owner" }).click()
  await page.getByRole("option", { name: "Unassigned" }).click()
  await expect(row).toContainText("John Underhill")

  await row.getByRole("link", { name: "John Underhill" }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/donors/${donor.id}`))
  await expect(page.getByRole("meter", { name: "Touchpoint meter" }).first()).toHaveAttribute(
    "aria-valuetext",
    "100 of 80 points"
  )
})

test("the donor list shows each donor's meter", async ({ page }) => {
  await page.goto("/dashboard?view=donor-crm")
  await expect(page.getByRole("columnheader", { name: "Meter" })).toBeVisible()
  await page.getByRole("searchbox", { name: /Search donors/ }).fill("John Underhill")
  await expect(
    page.getByRole("meter", { name: "Touchpoint meter" }).and(page.locator('[aria-valuetext="100 of 80 points, ready to ask"]'))
  ).toBeVisible()
})
