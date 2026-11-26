"use server"

import { revalidatePath } from "next/cache"

import { getCurrentUserOrg } from "@/lib/auth"
import { logAuditEvent } from "@/lib/audit"
import { loadTouchpointKinds } from "@/lib/meter/log-touchpoint"
import type { AskOutcome, TouchpointKind } from "@/lib/meter/rules"
import {
  getDonorMeter,
  recordMeterAsk,
  setMeterCapacity,
  type DonorMeter,
} from "@/lib/meter/service"
import { isFeatureEnabled } from "@/lib/org-features"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Touchpoint meter actions. Every one resolves the organisation from the
 * signed-in user and refuses unless the `touchpoint_meter` feature is switched
 * on for that organisation.
 */

type Session = { orgId: string; userId: string }

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

export async function getMeterForDonor(donorId: string): Promise<DonorMeterResult> {
  const session = await meterSession()
  if (!session) return { enabled: false }

  const admin = createAdminClient()
  const [result, kinds] = await Promise.all([
    getDonorMeter(admin, { ...session, donorId }),
    loadTouchpointKinds(admin, session.orgId),
  ])
  if (!result.ok) return { enabled: true, ok: false, error: result.message }
  return { enabled: true, ok: true, meter: result.meter, kinds }
}

export async function updateMeterCapacity(
  donorId: string,
  capacity: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await meterSession()
  if (!session) return OFF

  const result = await setMeterCapacity(createAdminClient(), { ...session, donorId, capacity })
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
  donorId: string,
  input: {
    outcome: AskOutcome
    amountAsked?: number | null
    amountGiven?: number | null
    note?: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await meterSession()
  if (!session) return OFF

  const result = await recordMeterAsk(createAdminClient(), { ...session, donorId, ...input })
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
