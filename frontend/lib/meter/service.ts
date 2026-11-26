import type { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import { fiscalYearOf, fiscalYearRange } from "@/lib/fiscal-year"

import {
  applyAskOutcome,
  bestYearlyGiving,
  meterStatus,
  suggestCapacity,
  type AskOutcome,
  type MeterState,
  type MeterStatus,
} from "./rules"

/**
 * Reading and changing a donor's meter. Server-only.
 *
 * Callers pass an org id derived from the signed-in user; every function
 * checks the donor belongs to that organisation before doing anything.
 * Whether the feature is switched on for the org is the caller's check
 * (see app/actions/meter.ts).
 */

type Admin = ReturnType<typeof createAdminClient>

export const MAX_CAPACITY = 2000

export type MeterContext = { orgId: string; donorId: string; userId: string | null }

export type MeterTouchpoint = {
  id: string
  kind: string | null
  type: string
  points: number
  date: string
  subject: string | null
  createdBy: string | null
}

export type MeterAskSummary = {
  askedAt: string
  outcome: string
  amountAsked: number | null
  amountGiven: number | null
  fillBefore: number
  capacityBefore: number
}

export type DonorMeter = {
  status: MeterStatus
  capacitySource: "suggested" | "manual"
  /** What the giving history suggests today; shown when the capacity was set by hand. */
  suggestedCapacity: number
  cycleStartedAt: string
  /** Touchpoints counted in the current cycle, newest first. */
  touchpoints: MeterTouchpoint[]
  lastAsk: MeterAskSummary | null
}

export type MeterFailure = {
  ok: false
  reason: "donor_not_found" | "invalid" | "conflict" | "db"
  message: string
}

type MeterRow = {
  donor_id: string
  capacity: number
  capacity_source: "suggested" | "manual"
  carried_points: number
  cycle_started_at: string
}

const NOT_FOUND: MeterFailure = { ok: false, reason: "donor_not_found", message: "Donor not found." }

async function donorInOrg(admin: Admin, ctx: MeterContext): Promise<boolean> {
  const { data } = await admin
    .from("donors")
    .select("id")
    .eq("id", ctx.donorId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  return !!data
}

/** Suggested capacity from the donor's best of the last three fiscal years. */
async function suggestedCapacityFor(admin: Admin, ctx: MeterContext): Promise<number> {
  const { data: org } = await admin
    .from("organizations")
    .select("fiscal_year_start_month")
    .eq("id", ctx.orgId)
    .maybeSingle()
  const startMonth = Number(org?.fiscal_year_start_month) || 1
  const today = new Date()
  const earliest = fiscalYearRange(fiscalYearOf(today, startMonth) - 2, startMonth).start

  const gifts = await fetchAllRows<{ date: string | null; amount: unknown }>((from, to) =>
    admin
      .from("donations")
      .select("date, amount")
      .eq("donor_id", ctx.donorId)
      .gte("date", earliest)
      .order("id")
      .range(from, to)
  )
  return suggestCapacity(bestYearlyGiving(gifts, startMonth, today))
}

async function loadMeterRow(admin: Admin, ctx: MeterContext): Promise<MeterRow | null> {
  const { data, error } = await admin
    .from("donor_meters")
    .select("donor_id, capacity, capacity_source, carried_points, cycle_started_at")
    .eq("donor_id", ctx.donorId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as MeterRow | null) ?? null
}

/** The donor's meter row, created with the suggested capacity the first time it is needed. */
async function ensureMeterRow(
  admin: Admin,
  ctx: MeterContext,
  suggested: number
): Promise<MeterRow> {
  const existing = await loadMeterRow(admin, ctx)
  if (existing) return existing

  // ignoreDuplicates: two first views at once must not fight over the row.
  const { error } = await admin.from("donor_meters").upsert(
    {
      donor_id: ctx.donorId,
      org_id: ctx.orgId,
      capacity: suggested,
      capacity_source: "suggested",
      updated_by: ctx.userId,
    },
    { onConflict: "donor_id", ignoreDuplicates: true }
  )
  if (error) throw new Error(error.message)
  const created = await loadMeterRow(admin, ctx)
  if (!created) throw new Error("Meter could not be created.")
  return created
}

const toState = (row: MeterRow): MeterState => ({
  capacity: row.capacity,
  carriedPoints: row.carried_points,
  cycleStartedAt: row.cycle_started_at,
})

async function cycleTouchpoints(admin: Admin, ctx: MeterContext, row: MeterRow): Promise<MeterTouchpoint[]> {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
    admin
      .from("interactions")
      .select("id, type, touchpoint_type, points, date, subject, created_by")
      .eq("donor_id", ctx.donorId)
      // Counted by when it was logged, so a touchpoint entered after the fact still counts.
      .gte("created_at", row.cycle_started_at)
      .gt("points", 0)
      .order("date", { ascending: false })
      .order("id")
      .range(from, to)
  )
  return rows.map((r) => ({
    id: String(r.id),
    kind: (r.touchpoint_type as string | null) ?? null,
    type: String(r.type),
    points: Number(r.points) || 0,
    date: String(r.date),
    subject: (r.subject as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
  }))
}

export async function getDonorMeter(
  admin: Admin,
  ctx: MeterContext
): Promise<{ ok: true; meter: DonorMeter } | MeterFailure> {
  if (!(await donorInOrg(admin, ctx))) return NOT_FOUND
  try {
    const suggested = await suggestedCapacityFor(admin, ctx)
    const row = await ensureMeterRow(admin, ctx, suggested)
    const touchpoints = await cycleTouchpoints(admin, ctx, row)
    const fill = row.carried_points + touchpoints.reduce((sum, t) => sum + t.points, 0)

    const { data: ask } = await admin
      .from("meter_asks")
      .select("asked_at, outcome, amount_asked, amount_given, fill_before, capacity_before")
      .eq("donor_id", ctx.donorId)
      .eq("org_id", ctx.orgId)
      .order("asked_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      ok: true,
      meter: {
        status: meterStatus(toState(row), fill),
        capacitySource: row.capacity_source,
        suggestedCapacity: suggested,
        cycleStartedAt: row.cycle_started_at,
        touchpoints,
        lastAsk: ask
          ? {
              askedAt: String(ask.asked_at),
              outcome: String(ask.outcome),
              amountAsked: ask.amount_asked == null ? null : Number(ask.amount_asked),
              amountGiven: ask.amount_given == null ? null : Number(ask.amount_given),
              fillBefore: Number(ask.fill_before),
              capacityBefore: Number(ask.capacity_before),
            }
          : null,
      },
    }
  } catch (e) {
    return { ok: false, reason: "db", message: e instanceof Error ? e.message : "Could not load the meter." }
  }
}

export async function setMeterCapacity(
  admin: Admin,
  input: MeterContext & { capacity: number }
): Promise<{ ok: true } | MeterFailure> {
  const { capacity } = input
  if (!Number.isInteger(capacity) || capacity < 5 || capacity > MAX_CAPACITY) {
    return { ok: false, reason: "invalid", message: `Capacity must be a whole number between 5 and ${MAX_CAPACITY}.` }
  }
  if (!(await donorInOrg(admin, input))) return NOT_FOUND
  try {
    await ensureMeterRow(admin, input, capacity)
    const { error } = await admin
      .from("donor_meters")
      .update({
        capacity,
        capacity_source: "manual",
        updated_by: input.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("donor_id", input.donorId)
      .eq("org_id", input.orgId)
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: "db", message: e instanceof Error ? e.message : "Could not save the capacity." }
  }
}

const OUTCOME_CODE = (outcome: AskOutcome): string =>
  outcome.kind === "declined" ? `declined_${outcome.adjust}` : outcome.kind

export async function recordMeterAsk(
  admin: Admin,
  input: MeterContext & {
    outcome: AskOutcome
    amountAsked?: number | null
    amountGiven?: number | null
    note?: string | null
    opportunityId?: string | null
  }
): Promise<{ ok: true; askId: string } | MeterFailure> {
  const { outcome } = input
  if (outcome.kind === "gave_partial" && !(outcome.amountAsked > 0 && outcome.amountGiven >= 0)) {
    return { ok: false, reason: "invalid", message: "Enter the amount asked and the amount given." }
  }
  if (outcome.kind === "declined" && outcome.adjust === "raise_capacity") {
    if (!Number.isInteger(outcome.newCapacity) || outcome.newCapacity > MAX_CAPACITY) {
      return { ok: false, reason: "invalid", message: `Capacity must be a whole number up to ${MAX_CAPACITY}.` }
    }
  }
  if (!(await donorInOrg(admin, input))) return NOT_FOUND

  try {
    const row = await loadMeterRow(admin, input)
    if (!row) return NOT_FOUND
    const touchpoints = await cycleTouchpoints(admin, input, row)
    const fillBefore = row.carried_points + touchpoints.reduce((sum, t) => sum + t.points, 0)
    const next = applyAskOutcome(toState(row), fillBefore, outcome, new Date().toISOString())

    const { data, error } = await admin.rpc("record_meter_ask", {
      p_org_id: input.orgId,
      p_donor_id: input.donorId,
      p_expected_cycle_started_at: row.cycle_started_at,
      p_outcome: OUTCOME_CODE(outcome),
      p_amount_asked: input.amountAsked ?? null,
      p_amount_given: input.amountGiven ?? null,
      p_fill_before: fillBefore,
      p_new_capacity: next.capacity,
      p_new_carried_points: next.carriedPoints,
      p_opportunity_id: input.opportunityId ?? null,
      p_note: input.note?.trim() || null,
      p_recorded_by: input.userId,
    })
    if (error) {
      if (error.message.includes("meter_changed")) {
        return { ok: false, reason: "conflict", message: "This ask was already recorded. Refresh to see the meter." }
      }
      throw new Error(error.message)
    }
    return { ok: true, askId: String(data) }
  } catch (e) {
    return { ok: false, reason: "db", message: e instanceof Error ? e.message : "Could not record the ask." }
  }
}
