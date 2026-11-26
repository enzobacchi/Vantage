import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

/**
 * Touchpoint logging through the real API route (the one the mobile app
 * uses), against the local database with the meter migration applied.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

async function sampleDonor(name: string): Promise<{ id: string; org_id: string }> {
  const { data: org } = await admin.from("organizations").select("id").eq("name", "Sample Outreach (Local)").single()
  if (!org) throw new Error("Sample org not seeded")
  const { data } = await admin.from("donors").select("id, org_id").eq("org_id", org.id).eq("display_name", name).limit(1).single()
  if (!data) throw new Error(`Donor ${name} not found`)
  return data as { id: string; org_id: string }
}

const created: string[] = []
test.afterAll(async () => {
  if (created.length) await admin.from("interactions").delete().in("id", created)
})

test("a coffee is saved as a 50-point meeting with its organisation and author", async ({ page }) => {
  const donor = await sampleDonor("Vanessa Sorensen")
  const res = await page.request.post("/api/interactions", {
    headers: { origin: "http://localhost:3000" },
    data: { donor_id: donor.id, kind: "coffee", content: "e2e coffee" },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  created.push(body.id)
  expect(body).toMatchObject({ type: "meeting", touchpoint_type: "coffee", points: 50, org_id: donor.org_id })
  expect(body.created_by).toBeTruthy()
})

test("an older client sending only a type still works and earns the matching points", async ({ page }) => {
  const donor = await sampleDonor("John Underhill")
  const res = await page.request.post("/api/interactions", {
    headers: { origin: "http://localhost:3000" },
    data: { donor_id: donor.id, type: "call", subject: "e2e call", content: "" },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  created.push(body.id)
  expect(body).toMatchObject({ type: "call", touchpoint_type: "call", points: 15, status: null })
})

test("an unknown kind or type is refused", async ({ page }) => {
  const donor = await sampleDonor("Matt Delgado")
  for (const data of [
    { donor_id: donor.id, kind: "telepathy" },
    { donor_id: donor.id, type: "fax" },
  ]) {
    const res = await page.request.post("/api/interactions", { headers: { origin: "http://localhost:3000" }, data })
    expect(res.status()).toBe(400)
  }
})
