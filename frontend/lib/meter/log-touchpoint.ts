import type { createAdminClient } from "@/lib/supabase/admin"
import type { Interaction } from "@/types/database"

import {
  pointsForKind,
  resolveTouchpointKinds,
  type BaseInteractionType,
  type TouchpointKind,
} from "./rules"

/**
 * The one place a touchpoint is written.
 *
 * Every writer — the web dialogs, the mobile route, the three email paths and
 * Scout's tools — goes through `logTouchpoint`, so each touchpoint gets its
 * kind, its points and its author the same way, and the donor is always
 * checked against the caller's organisation. Server-only.
 */

export type TouchpointAdmin = ReturnType<typeof createAdminClient>

const BASE_TYPES: readonly BaseInteractionType[] = ["email", "call", "meeting", "note", "task"]

export type LogTouchpointInput = {
  /** Organisation derived from the signed-in user — never from the client. */
  orgId: string
  /** Who logged it; null for system-written entries. */
  userId: string | null
  donorId: string
  /** A touchpoint kind key ("coffee", "text", …). Wins over `type` when both are given. */
  kind?: string
  /** One of the five base types, for callers that predate kinds; mapped to the kind of the same name. */
  type?: BaseInteractionType
  direction?: "inbound" | "outbound" | null
  subject?: string | null
  content?: string | null
  /** ISO timestamp; defaults to now. */
  date?: string
  /** Tasks only; defaults to "pending". */
  status?: "pending" | "completed" | null
  /** Pass the result of `loadTouchpointKinds` when logging many in one request. */
  kinds?: readonly TouchpointKind[]
}

export type LogTouchpointResult =
  | { ok: true; interaction: Interaction }
  | { ok: false; reason: "donor_not_found" | "invalid" | "db"; message: string }

/**
 * The organisation's touchpoint kinds: the built-in defaults with its own
 * overrides and additions on top. If the overrides cannot be read, the
 * defaults are used — logging a touchpoint must not fail over a settings read.
 */
export async function loadTouchpointKinds(
  admin: TouchpointAdmin,
  orgId: string
): Promise<TouchpointKind[]> {
  const { data, error } = await admin
    .from("org_touchpoint_kinds")
    .select("key, label, base_type, points, archived")
    .eq("org_id", orgId)
  if (error) {
    console.error("[meter] could not load touchpoint kinds, using defaults:", error.message)
    return resolveTouchpointKinds([])
  }
  const rows = (data ?? []) as Array<{
    key: string
    label: string
    base_type: string
    points: number
    archived: boolean
  }>
  const archived = new Set(rows.filter((r) => r.archived).map((r) => r.key))
  const overrides = rows
    .filter((r) => !r.archived && BASE_TYPES.includes(r.base_type as BaseInteractionType))
    .map((r) => ({
      key: r.key,
      label: r.label,
      baseType: r.base_type as BaseInteractionType,
      points: r.points,
    }))
  return resolveTouchpointKinds(overrides).filter((k) => !archived.has(k.key))
}

export async function logTouchpoint(
  admin: TouchpointAdmin,
  input: LogTouchpointInput
): Promise<LogTouchpointResult> {
  const kindKey = input.kind ?? input.type
  if (!kindKey) {
    return { ok: false, reason: "invalid", message: "A touchpoint needs a kind." }
  }

  const { data: donor, error: donorError } = await admin
    .from("donors")
    .select("id")
    .eq("id", input.donorId)
    .eq("org_id", input.orgId)
    .maybeSingle()
  if (donorError || !donor) {
    return { ok: false, reason: "donor_not_found", message: "Donor not found." }
  }

  const kinds = input.kinds ?? (await loadTouchpointKinds(admin, input.orgId))
  const kind = kinds.find((k) => k.key === kindKey)
  if (!kind) {
    return { ok: false, reason: "invalid", message: `Unknown touchpoint kind "${kindKey}".` }
  }

  const row = {
    donor_id: input.donorId,
    type: kind.baseType,
    touchpoint_type: kind.key,
    points: pointsForKind(kinds, kind.key),
    created_by: input.userId,
    direction: input.direction ?? null,
    subject: input.subject ?? null,
    content: input.content ?? "",
    date: input.date ?? new Date().toISOString(),
    status: kind.baseType === "task" ? (input.status ?? "pending") : null,
  }

  const { data: inserted, error } = await admin.from("interactions").insert(row).select().single()
  if (error || !inserted) {
    return { ok: false, reason: "db", message: error?.message ?? "Failed to save touchpoint." }
  }
  return { ok: true, interaction: inserted as Interaction }
}
