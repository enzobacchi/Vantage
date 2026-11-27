import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { logTouchpoint } from "@/lib/meter/log-touchpoint"
import { bestYearlyGiving, suggestCapacity } from "@/lib/meter/rules"
import { getDonorMeter, listMeterFills, listReadyToAsk, recordMeterAsk, setMeterCapacity } from "@/lib/meter/service"

/**
 * The meter service against the local database: Eric's whiteboard, end to end.
 * Runs in Node (no browser) on the three sample major donors.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } }
)

type Donor = { id: string; org_id: string }
const donors: Record<string, Donor> = {}
const touchpointIds: string[] = []

async function resetMeters() {
  const ids = Object.values(donors).map((d) => d.id)
  if (touchpointIds.length) await admin.from("interactions").delete().in("id", touchpointIds)
  touchpointIds.length = 0
  // Points left on these three sample donors by other suites or by hand
  // (every point ever logged counts toward a fresh meter).
  await admin.from("interactions").update({ points: 0 }).in("donor_id", ids).gt("points", 0)
  await admin.from("meter_asks").delete().in("donor_id", ids)
  await admin.from("donor_meters").delete().in("donor_id", ids)
}

test.beforeAll(async () => {
  const { data: org } = await admin.from("organizations").select("id").eq("name", "Sample Outreach (Local)").single()
  if (!org) throw new Error("Sample org not seeded")
  for (const name of ["Vanessa Sorensen", "John Underhill", "Matt Delgado"]) {
    const { data } = await admin.from("donors").select("id, org_id").eq("org_id", org.id).eq("display_name", name).order("total_lifetime_value", { ascending: false }).limit(1).single()
    if (!data) throw new Error(`${name} not found`)
    donors[name] = data as Donor
  }
  await resetMeters()
})
test.afterAll(resetMeters)

async function log(donor: Donor, kind: string) {
  const result = await logTouchpoint(admin, { orgId: donor.org_id, userId: null, donorId: donor.id, kind })
  if (!result.ok) throw new Error(result.message)
  touchpointIds.push(result.interaction.id)
}

const ctx = (donor: Donor) => ({ orgId: donor.org_id, donorId: donor.id, userId: null })

test("suggested capacities match the whiteboard: 150, 80, 40", async () => {
  const capacities: number[] = []
  for (const name of ["Vanessa Sorensen", "John Underhill", "Matt Delgado"]) {
    const meter = await getDonorMeter(admin, ctx(donors[name]))
    if (!meter.ok) throw new Error(meter.message)
    expect(meter.meter.status.fill).toBe(0)
    expect(meter.meter.capacitySource).toBe("suggested")
    capacities.push(meter.meter.status.capacity)
  }
  expect(capacities).toEqual([150, 80, 40])
})

test("email, text and coffee add 5, 10 and 50; a full meter is ready; an ask resets it", async () => {
  const matt = donors["Matt Delgado"]
  await log(matt, "email")
  await log(matt, "text")
  let meter = await getDonorMeter(admin, ctx(matt))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status).toMatchObject({ fill: 15, capacity: 40, ready: false })

  await log(matt, "coffee")
  meter = await getDonorMeter(admin, ctx(matt))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status).toMatchObject({ fill: 65, capacity: 40, ready: true, percent: 100 })
  expect(meter.meter.touchpoints.map((t) => t.kind).sort()).toEqual(["coffee", "email", "text"])

  const ask = await recordMeterAsk(admin, { ...ctx(matt), outcome: { kind: "gave_full" }, amountAsked: 10_000, amountGiven: 10_000 })
  expect(ask.ok).toBe(true)
  meter = await getDonorMeter(admin, ctx(matt))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status).toMatchObject({ fill: 0, capacity: 40, ready: false })
  expect(meter.meter.touchpoints).toEqual([])
  expect(meter.meter.lastAsk).toMatchObject({ outcome: "gave_full", fillBefore: 65 })
})

test("a smaller gift drains part of the meter; a declined ask can raise the capacity", async () => {
  const john = donors["John Underhill"]
  await getDonorMeter(admin, ctx(john))
  await log(john, "coffee")
  await log(john, "coffee")

  // Asked 50,000, gave 12,500: a quarter of the 100 points is used up.
  let ask = await recordMeterAsk(admin, {
    ...ctx(john),
    outcome: { kind: "gave_partial", amountAsked: 50_000, amountGiven: 12_500 },
    amountAsked: 50_000,
    amountGiven: 12_500,
  })
  expect(ask.ok).toBe(true)
  let meter = await getDonorMeter(admin, ctx(john))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status).toMatchObject({ fill: 75, capacity: 80 })

  ask = await recordMeterAsk(admin, {
    ...ctx(john),
    outcome: { kind: "declined", adjust: "raise_capacity", newCapacity: 120 },
  })
  expect(ask.ok).toBe(true)
  meter = await getDonorMeter(admin, ctx(john))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status).toMatchObject({ fill: 75, capacity: 120, ready: false })
  expect(meter.meter.capacitySource).toBe("manual")
})

test("the fundraiser can override the capacity, within sane bounds", async () => {
  const vanessa = donors["Vanessa Sorensen"]
  await getDonorMeter(admin, ctx(vanessa))
  expect((await setMeterCapacity(admin, { ...ctx(vanessa), capacity: 200 })).ok).toBe(true)
  const meter = await getDonorMeter(admin, ctx(vanessa))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status.capacity).toBe(200)
  expect(meter.meter.capacitySource).toBe("manual")

  for (const bad of [0, -5, 12.5, 100_000, Number.NaN]) {
    expect((await setMeterCapacity(admin, { ...ctx(vanessa), capacity: bad })).ok).toBe(false)
  }
})

test("a donor from another organisation has no meter", async () => {
  const matt = donors["Matt Delgado"]
  const other = { orgId: "00000000-0000-0000-0000-000000000001", donorId: matt.id, userId: null }
  expect(await getDonorMeter(admin, other)).toMatchObject({ ok: false, reason: "donor_not_found" })
  expect(await recordMeterAsk(admin, { ...other, outcome: { kind: "gave_full" } })).toMatchObject({ ok: false })
  expect(await setMeterCapacity(admin, { ...other, capacity: 50 })).toMatchObject({ ok: false })
})

test("a touchpoint logged before the donor's meter was ever opened still counts", async () => {
  await resetMeters()
  const matt = donors["Matt Delgado"]
  await log(matt, "coffee") // no donor_meters row exists yet
  const fills = await listMeterFills(admin, matt.org_id, { donorIds: [matt.id] })
  expect(fills).toMatchObject([{ donorId: matt.id, fill: 50, capacity: 40, ready: true }])

  const meter = await getDonorMeter(admin, ctx(matt))
  if (!meter.ok) throw new Error(meter.message)
  expect(meter.meter.status).toMatchObject({ fill: 50, capacity: 40, ready: true })
})

test("an ask can be recorded for a donor whose meter was never opened", async () => {
  await resetMeters()
  const john = donors["John Underhill"]
  await log(john, "visit")
  const ask = await recordMeterAsk(admin, { ...ctx(john), outcome: { kind: "gave_full" } })
  expect(ask.ok).toBe(true)
  const fills = await listMeterFills(admin, john.org_id, { donorIds: [john.id] })
  expect(fills).toMatchObject([{ fill: 0, capacity: 80, ready: false }])
})

test("an ask can be tied to a pipeline opportunity, but only the donor's own", async () => {
  await resetMeters()
  const john = donors["John Underhill"]
  const matt = donors["Matt Delgado"]
  const { data: opp, error } = await admin
    .from("opportunities")
    .insert({ organization_id: matt.org_id, donor_id: matt.id, title: "Meter test gift", amount: 5000, status: "closed_won" })
    .select("id")
    .single()
  if (error || !opp) throw new Error(error?.message ?? "no opportunity")
  try {
    const wrongDonor = await recordMeterAsk(admin, { ...ctx(john), outcome: { kind: "gave_full" }, opportunityId: opp.id })
    expect(wrongDonor).toMatchObject({ ok: false, reason: "invalid" })

    await log(matt, "coffee")
    const ask = await recordMeterAsk(admin, { ...ctx(matt), outcome: { kind: "gave_full" }, opportunityId: opp.id })
    if (!ask.ok) throw new Error(ask.message)
    const { data: saved } = await admin.from("meter_asks").select("opportunity_id, fill_before").eq("id", ask.askId).single()
    expect(saved).toMatchObject({ opportunity_id: opp.id, fill_before: 50 })
  } finally {
    await admin.from("opportunities").delete().eq("id", opp.id)
  }
})

test("the database's suggested capacity matches the app's for a spread of donors", async () => {
  await resetMeters()
  const orgId = donors["Matt Delgado"].org_id
  const { data: org } = await admin.from("organizations").select("fiscal_year_start_month").eq("id", orgId).single()
  const startMonth = Number(org?.fiscal_year_start_month) || 1
  // The 150 biggest donors plus 150 ordinary ones.
  const { data: top } = await admin.from("donors").select("id").eq("org_id", orgId).order("total_lifetime_value", { ascending: false }).limit(150)
  const { data: rest } = await admin.from("donors").select("id").eq("org_id", orgId).order("id").limit(150)
  const ids = [...new Set([...(top ?? []), ...(rest ?? [])].map((d) => d.id as string))]

  const fills = await listMeterFills(admin, orgId, { donorIds: ids })
  expect(fills).toHaveLength(ids.length)
  const fromDb = new Map(fills.map((f) => [f.donorId, f.capacity]))

  const mismatches: string[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const gifts: Array<{ donor_id: string; date: string; amount: unknown }> = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from("donations").select("donor_id, date, amount").in("donor_id", chunk).order("id").range(from, from + 999)
      if (error) throw new Error(error.message)
      gifts.push(...((data ?? []) as typeof gifts))
      if ((data ?? []).length < 1000) break
    }
    for (const id of chunk) {
      const expected = suggestCapacity(bestYearlyGiving(gifts.filter((g) => g.donor_id === id), startMonth))
      if (fromDb.get(id) !== expected) mismatches.push(`${id}: db ${fromDb.get(id)} vs app ${expected}`)
    }
  }
  expect(mismatches).toEqual([])
})

test("ready to ask lists donors by how full their meter is, and filters by owner", async () => {
  await resetMeters()
  const { "Vanessa Sorensen": vanessa, "John Underhill": john, "Matt Delgado": matt } = donors
  await log(matt, "coffee") // 50 / 40  → ready
  await log(john, "coffee") // 50 / 80  → 63%
  await log(vanessa, "email") // 5 / 150 → 3%

  const all = await listReadyToAsk(admin, matt.org_id, {})
  const mine = all.filter((r) => [vanessa.id, john.id, matt.id].includes(r.donorId))
  expect(mine.map((r) => [r.name, r.fill, r.capacity, r.ready])).toEqual([
    ["Matt Delgado", 50, 40, true],
    ["John Underhill", 50, 80, false],
    ["Vanessa Sorensen", 5, 150, false],
  ])
  expect(all.every((r) => r.fill > 0)).toBe(true)

  const owner = "00000000-0000-0000-0000-00000000abcd"
  expect(await listReadyToAsk(admin, matt.org_id, { assignedTo: owner })).toEqual([])
  const unassigned = await listReadyToAsk(admin, matt.org_id, { assignedTo: null })
  expect(unassigned.some((r) => r.donorId === matt.id)).toBe(true)
})
