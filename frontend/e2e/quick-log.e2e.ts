import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

/** Quick log in the browser: log from the header, see the meter move, undo. */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

let donor: { id: string; org_id: string }

test.beforeAll(async () => {
  const { data: org } = await admin.from("organizations").select("id").eq("name", "Sample Outreach (Local)").single()
  if (!org) throw new Error("Sample org not seeded")
  const { data } = await admin
    .from("donors")
    .select("id, org_id")
    .eq("org_id", org.id)
    .eq("display_name", "Matt Delgado")
    .order("total_lifetime_value", { ascending: false })
    .limit(1)
    .single()
  donor = data as { id: string; org_id: string }
  for (const key of ["quick_log", "touchpoint_meter"]) {
    await admin.from("org_features").upsert({ org_id: org.id, feature_key: key, enabled: true }, { onConflict: "org_id,feature_key" })
  }
  await cleanup()
})
test.afterAll(cleanup)

async function cleanup() {
  await admin.from("interactions").delete().eq("donor_id", donor.id).ilike("content", "quick-log e2e%")
  await admin.from("meter_asks").delete().eq("donor_id", donor.id)
  await admin.from("donor_meters").delete().eq("donor_id", donor.id)
}

const loggedRows = async () => {
  const { data } = await admin
    .from("interactions")
    .select("type, touchpoint_type, points, created_by")
    .eq("donor_id", donor.id)
    .ilike("content", "quick-log e2e%")
  return data ?? []
}

test("log a coffee from a donor's profile: the meter moves and Undo removes it", async ({ page }) => {
  await page.goto(`/dashboard/donors/${donor.id}`)
  const meter = page.getByRole("meter", { name: "Touchpoint meter" })
  await expect(meter).toHaveAttribute("aria-valuetext", "0 of 40 points")

  await page.getByRole("button", { name: "Log touchpoint" }).last().click()
  const dialog = page.getByRole("dialog", { name: "Log a touchpoint" })
  await expect(dialog.getByText("Matt Delgado")).toBeVisible()
  await dialog.getByRole("radio", { name: /Coffee or meal/ }).click()
  await dialog.getByLabel("Note (optional)").fill("quick-log e2e coffee")
  await dialog.getByRole("button", { name: "Log touchpoint" }).click()

  const toast = page.getByRole("region", { name: /Notifications/ }).getByRole("listitem").first()
  await expect(toast).toContainText("Coffee or meal logged · +50")
  await expect(toast).toContainText("Matt Delgado · 50 / 40 · Ready to ask")
  await expect(meter).toHaveAttribute("aria-valuetext", "50 of 40 points")
  await expect(page.getByText("Ready to ask").first()).toBeVisible()
  expect(await loggedRows()).toMatchObject([{ type: "meeting", touchpoint_type: "coffee", points: 50 }])

  await toast.getByRole("button", { name: "Undo" }).click()
  await expect(meter).toHaveAttribute("aria-valuetext", "0 of 40 points")
  expect(await loggedRows()).toEqual([])
})

test("log from the header: search for the donor, tap a kind, save", async ({ page }) => {
  await page.goto("/dashboard")
  await page.locator("header").getByRole("button", { name: "Log touchpoint" }).click()
  const dialog = page.getByRole("dialog", { name: "Log a touchpoint" })
  await expect(dialog.getByRole("button", { name: "Log touchpoint" })).toBeDisabled()

  await dialog.getByLabel("Donor").fill("Matt Delgado")
  // Several sample donors share this name; lifetime giving tells them apart.
  await dialog.getByRole("button", { name: /Matt Delgado.*\$30,\d{3}\.\d{2} lifetime/ }).click()
  await dialog.getByRole("radio", { name: /^Text/ }).click()
  await dialog.getByLabel("Note (optional)").fill("quick-log e2e text")
  await dialog.getByRole("button", { name: "Log touchpoint" }).click()

  await expect(page.getByRole("region", { name: /Notifications/ }).getByRole("listitem").first()).toContainText(
    "Text logged · +10"
  )
  const rows = await loggedRows()
  expect(rows).toMatchObject([{ type: "note", touchpoint_type: "text", points: 10 }])
  expect(rows[0].created_by).toBeTruthy()
})
