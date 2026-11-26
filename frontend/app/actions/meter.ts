"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getCurrentUserOrg } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit"
import { parseAskInput, parseDonorId } from "@/lib/meter/ask-input"
import { loadTouchpointKinds } from "@/lib/meter/log-touchpoint"
import type { AskOutcome, TouchpointKind } from "@/lib/meter/rules"
import {
  getDonorMeter,
  listMeterFills,
  listReadyToAsk,
  recordMeterAsk,
  setMeterCapacity,
  type DonorMeter,
  type ReadyToAskRow,
} from "@/lib/meter/service"
import { isFeatureEnabled } from "@/lib/org-features"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Touchpoint meter actions. Every one resolves the organisation from the
 * signed-in user and refuses unless the `touchpoint_meter` feature is switched
 * on for that organisation.
 *
 * Arguments come from the browser and are validated at runtime: only named
 * fields are passed on, and the organisation and user always come from the
 * session — never from the payload.
 */

type Session = { orgId: string; userId: string }

const donorIdList = z.array(z.string().uuid()).max(200)
const ownerFilter = z.union([z.literal("all"), z.literal("unassigned"), z.string().uuid()])

async function meterSession(): Promise<Session | null> {
  const org = await getCurrentUserOrg()
  if (!org) return null
  if (!(await isFeatureEnabled(org.orgId, "touchpoint_meter"))) return null
  return { orgId: org.orgId, userId: org.userId }
}

const OFF = { ok: false as const, error: "The touchpoint meter is not available." }

export type DonorMeterResult =
  | { enabled: false }
  | { enabled: true; ok: true; meter: DonorMeter; kinds: TouchpointKind[] }
  | { enabled: true; ok: false; error: string }

export async function getMeterForDonor(rawDonorId: string): Promise<DonorMeterResult> {
  const session = await meterSession()
  if (!session) return { enabled: false }
  const donorId = parseDonorId(rawDonorId)
  if (!donorId) return { enabled: true, ok: false, error: "Donor not found." }

  const admin = createAdminClient()
  const [result, kinds] = await Promise.all([
    getDonorMeter(admin, { orgId: session.orgId, userId: session.userId, donorId }),
    loadTouchpointKinds(admin, session.orgId),
  ])
  if (!result.ok) return { enabled: true, ok: false, error: result.message }
  return { enabled: true, ok: true, meter: result.meter, kinds }
}

export async function updateMeterCapacity(
  rawDonorId: string,
  rawCapacity: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await meterSession()
  if (!session) return OFF
  const donorId = parseDonorId(rawDonorId)
  if (!donorId) return { ok: false, error: "Donor not found." }
  const capacity = typeof rawCapacity === "number" ? rawCapacity : Number.NaN

  const result = await setMeterCapacity(createAdminClient(), {
    orgId: session.orgId,
    userId: session.userId,
    donorId,
    capacity,
  })
  if (!result.ok) return { ok: false, error: result.message }

  await logAuditEvent({
    orgId: session.orgId,
    userId: session.userId,
    action: "meter.capacity_set",
    entityType: "donor",
    entityId: donorId,
    summary: `Meter capacity set to ${capacity}`,
    details: { capacity },
  })
  revalidatePath(`/dashboard/donors/${donorId}`)
  return { ok: true }
}

export async function recordAsk(
  rawDonorId: string,
  rawInput: {
    outcome: AskOutcome
    amountAsked?: number | null
    amountGiven?: number | null
    note?: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await meterSession()
  if (!session) return OFF
  const donorId = parseDonorId(rawDonorId)
  if (!donorId) return { ok: false, error: "Donor not found." }
  const input = parseAskInput(rawInput)
  if (!input) return { ok: false, error: "That ask could not be read. Check the amounts and try again." }

  const result = await recordMeterAsk(createAdminClient(), {
    orgId: session.orgId,
    userId: session.userId,
    donorId,
    outcome: input.outcome,
    amountAsked: input.amountAsked,
    amountGiven: input.amountGiven,
    note: input.note,
  })
  if (!result.ok) return { ok: false, error: result.message }

  await logAuditEvent({
    orgId: session.orgId,
    userId: session.userId,
    action: "meter.ask_recorded",
    entityType: "donor",
    entityId: donorId,
    summary: `Ask recorded: ${input.outcome.kind.replace("_", " ")}`,
    details: { outcome: input.outcome.kind, askId: result.askId },
  })
  revalidatePath(`/dashboard/donors/${donorId}`)
  return { ok: true }
}

// ── Meters across many donors ───────────────────────────────────────────────

export type MeterFillMap = Record<string, { fill: number; capacity: number; percent: number; ready: boolean }>

/** Meters for one page of the donor list. Empty (and `enabled: false`) when the feature is off. */
export async function getMeterFillsForDonors(
  rawDonorIds: unknown
): Promise<{ enabled: boolean; fills: MeterFillMap }> {
  const session = await meterSession()
  if (!session) return { enabled: false, fills: {} }
  const ids = donorIdList.safeParse(rawDonorIds)
  if (!ids.success || ids.data.length === 0) return { enabled: true, fills: {} }

  try {
    const fills = await listMeterFills(createAdminClient(), session.orgId, { donorIds: ids.data })
    return {
      enabled: true,
      fills: Object.fromEntries(
        fills.map((f) => [f.donorId, { fill: f.fill, capacity: f.capacity, percent: f.percent, ready: f.ready }])
      ),
    }
  } catch (e) {
    console.error("[meter] fills failed:", e instanceof Error ? e.message : e)
    return { enabled: true, fills: {} }
  }
}

export type ReadyToAskResult =
  | { enabled: false }
  | { enabled: true; ok: true; rows: ReadyToAskRow[]; readyCount: number; total: number }
  | { enabled: true; ok: false; error: string }

const READY_LIST_LIMIT = 50

/**
 * Donors with points on their meter, fullest first. `owner` is "all",
 * "unassigned", or a team member's user id.
 */
export async function getReadyToAsk(rawOwner: unknown): Promise<ReadyToAskResult> {
  const session = await meterSession()
  if (!session) return { enabled: false }
  const owner = ownerFilter.safeParse(rawOwner)
  if (!owner.success) return { enabled: true, ok: false, error: "Unknown filter." }

  try {
    const rows = await listReadyToAsk(
      createAdminClient(),
      session.orgId,
      owner.data === "all" ? {} : { assignedTo: owner.data === "unassigned" ? null : owner.data }
    )
    return {
      enabled: true,
      ok: true,
      rows: rows.slice(0, READY_LIST_LIMIT),
      readyCount: rows.filter((r) => r.ready).length,
      total: rows.length,
    }
  } catch (e) {
    console.error("[meter] ready-to-ask failed:", e instanceof Error ? e.message : e)
    return { enabled: true, ok: false, error: "Could not load the list." }
  }
}
