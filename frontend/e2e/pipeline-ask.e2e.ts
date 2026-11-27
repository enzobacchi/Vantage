import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { logTouchpoint } from "@/lib/meter/log-touchpoint"

/** Closing a pipeline opportunity offers to record the ask on the donor's meter. */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

const TITLE = "Pipeline ask test gift"
let donor: { id: string; org_id: string }
let oppId = ""
const created: string[] = []

async function cleanup() {
  await admin.from("opportunities").delete().eq("organization_id", donor.org_id).eq("title", TITLE)
  if (created.length) await admin.from("interactions").delete().in("id", created)
  created.length = 0
  await admin.from("interactions").update({ points: 0 }).eq("donor_id", donor.id).gt("points", 0)
  await admin.from("meter_asks").delete().eq("donor_id", donor.id)
  await admin.from("donor_meters").delete().eq("donor_id", donor.id)
}

async function seedOpportunity() {
  await admin.from("opportunities").delete().eq("organization_id", donor.org_id).eq("title", TITLE)
  const { data, error } = await admin
    .from("opportunities")
    .insert({ organization_id: donor.org_id, donor_id: donor.id, title: TITLE, amount: 25000, status: "committed" })
    .select("id")
    .single()
  if (error || !data) throw new Error(error?.message ?? "no opportunity")
  oppId = data.id
}

test.beforeAll(async () => {
  const { data: org } = await admin.from("organizations").select("id").eq("name", "Sample Outreach (Local)").single()
  if (!org) throw new Error("Sample org not seeded")
  const { data } = await admin
    .from("donors")
    .select("id, org_id")
    .eq("org_id", org.id)
    .eq("display_name", "Daniel Stavros")
    .order("total_lifetime_value", { ascending: false })
    .limit(1)
    .single()
  if (!data) throw new Error("Daniel Stavros not found")
  donor = data as { id: string; org_id: string }
  await admin
    .from("org_features")
    .upsert({ org_id: org.id, feature_key: "touchpoint_meter", enabled: true }, { onConflict: "org_id,feature_key" })
  await cleanup()
  const result = await logTouchpoint(admin, { orgId: donor.org_id, userId: null, donorId: donor.id, kind: "coffee" })
  if (!result.ok) throw new Error(result.message)
  created.push(result.interaction.id)
})
test.afterAll(cleanup)

async function closeAs(page: import("@playwright/test").Page, stage: "Closed Won" | "Closed Lost") {
  await page.goto("/dashboard/pipeline")
  await page.getByText(TITLE).first().click()
  const edit = page.getByRole("dialog").filter({ hasText: "Stage" })
  await edit.getByRole("combobox").click()
  await page.getByRole("option", { name: stage }).click()
  await edit.getByRole("button", { name: /^Save/ }).click()
  return page.getByRole("dialog").filter({ hasText: "Record an ask" })
}

test("closing an opportunity as won offers to record the ask, and recording resets the meter", async ({ page }) => {
  await seedOpportunity()
  const ask = await closeAs(page, "Closed Won")
  await expect(ask).toContainText(`You closed “${TITLE}” as won`)
  await expect(ask.getByRole("radio", { name: "Gave in full" })).toHaveAttribute("aria-checked", "true")
  await expect(ask.getByLabel(/Amount asked/)).toHaveValue("25000")
  await ask.getByRole("button", { name: "Record ask" }).click()
  await expect(page.getByText("Ask recorded")).toBeVisible()

  const { data: asks } = await admin.from("meter_asks").select("opportunity_id, outcome, fill_before").eq("donor_id", donor.id)
  expect(asks).toMatchObject([{ opportunity_id: oppId, outcome: "gave_full", fill_before: 50 }])
})

test("the prompt can be dismissed without touching the meter, and closing as lost starts on Declined", async ({ page }) => {
  await admin.from("meter_asks").delete().eq("donor_id", donor.id)
  await seedOpportunity()
  const ask = await closeAs(page, "Closed Lost")
  await expect(ask.getByRole("radio", { name: "Declined" })).toHaveAttribute("aria-checked", "true")
  await ask.getByRole("button", { name: "Not an ask" }).click()
  await expect(ask).toBeHidden()

  const { data: asks } = await admin.from("meter_asks").select("id").eq("donor_id", donor.id)
  expect(asks).toEqual([])
  const { data: opp } = await admin.from("opportunities").select("status").eq("id", oppId).single()
  expect(opp?.status).toBe("closed_lost")
})
