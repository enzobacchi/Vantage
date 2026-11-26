import { expect, test } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { logTouchpoint } from "@/lib/meter/log-touchpoint"
import { getDonorMeter, recordMeterAsk, setMeterCapacity } from "@/lib/meter/service"

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
