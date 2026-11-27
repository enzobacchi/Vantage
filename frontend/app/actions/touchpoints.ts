"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getCurrentUserOrg } from "@/lib/auth"
import { loadTouchpointKinds, logTouchpoint } from "@/lib/meter/log-touchpoint"
import { canUndoTouchpoint, parseQuickLogInput, quickLogKinds } from "@/lib/meter/quick-log"
import { getDonorMeter } from "@/lib/meter/service"
import { getOrgFeatures } from "@/lib/org-features"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Quick log actions. The organisation and author always come from the
 * signed-in session; the browser supplies only a donor, a kind and a note.
 * All refuse unless the `quick_log` feature is on for the organisation.
 */

export type QuickLogKindOption = { key: string; label: string; points: number }

export type QuickLogConfig =
  | { enabled: false }
  | { enabled: true; kinds: QuickLogKindOption[]; showPoints: boolean }

async function quickLogSession() {
  const org = await getCurrentUserOrg()
  if (!org) return null
  const features = await getOrgFeatures(org.orgId)
  if (!features.quick_log) return null
  return { orgId: org.orgId, userId: org.userId, meterOn: features.touchpoint_meter }
}

export async function getQuickLogConfig(): Promise<QuickLogConfig> {
  const session = await quickLogSession()
  if (!session) return { enabled: false }
  const kinds = await loadTouchpointKinds(createAdminClient(), session.orgId)
  return {
    enabled: true,
    kinds: quickLogKinds(kinds).map((k) => ({ key: k.key, label: k.label, points: k.points })),
    showPoints: session.meterOn,
  }
}

export type QuickLogResult =
  | {
      ok: true
      interactionId: string
      donorId: string
      donorName: string
      kindLabel: string
      points: number
      meter: { fill: number; capacity: number; ready: boolean } | null
    }
  | { ok: false; error: string }

export async function quickLogTouchpoint(raw: unknown): Promise<QuickLogResult> {
  const session = await quickLogSession()
  if (!session) return { ok: false, error: "Quick log is not available." }
  const input = parseQuickLogInput(raw)
  if (!input) return { ok: false, error: "Choose a donor and what kind of touchpoint it was." }

  const admin = createAdminClient()
  const kinds = await loadTouchpointKinds(admin, session.orgId)
  const offered = quickLogKinds(kinds).find((k) => k.key === input.kind)
  if (!offered) return { ok: false, error: "That kind of touchpoint is not available." }

  const logged = await logTouchpoint(admin, {
    orgId: session.orgId,
    userId: session.userId,
    donorId: input.donorId,
    kind: offered.key,
    subject: offered.label,
    content: input.note,
    kinds,
  })
  if (!logged.ok) return { ok: false, error: logged.message }

  const { data: donor } = await admin
    .from("donors")
    .select("display_name")
    .eq("id", input.donorId)
    .eq("org_id", session.orgId)
    .maybeSingle()

  let meter: { fill: number; capacity: number; ready: boolean } | null = null
  if (session.meterOn) {
    const result = await getDonorMeter(admin, {
      orgId: session.orgId,
      userId: session.userId,
      donorId: input.donorId,
    })
    if (result.ok) {
      const { fill, capacity, ready } = result.meter.status
      meter = { fill, capacity, ready }
    }
  }

  revalidatePath("/dashboard")
  return {
    ok: true,
    interactionId: logged.interaction.id,
    donorId: input.donorId,
    donorName: (donor?.display_name as string | null) ?? "Donor",
    kindLabel: offered.label,
    points: logged.interaction.points,
    meter,
  }
}

/** Undo a touchpoint you just logged (author only, within a few minutes). */
export async function undoQuickLog(rawId: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await quickLogSession()
  if (!session) return { ok: false, error: "Quick log is not available." }
  const id = z.string().uuid().safeParse(rawId)
  if (!id.success) return { ok: false, error: "Nothing to undo." }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("interactions")
    .select("id, created_by, created_at, donors!inner(org_id)")
    .eq("id", id.data)
    .eq("donors.org_id", session.orgId)
    .maybeSingle()
  if (
    !row ||
    !canUndoTouchpoint(
      { createdBy: row.created_by as string | null, createdAt: String(row.created_at) },
      session.userId
    )
  ) {
    return { ok: false, error: "This touchpoint can no longer be undone here. Delete it from the donor's activity." }
  }

  const { error } = await admin.from("interactions").delete().eq("id", id.data)
  if (error) return { ok: false, error: "Could not undo. Try again." }
  revalidatePath("/dashboard")
  return { ok: true }
}
