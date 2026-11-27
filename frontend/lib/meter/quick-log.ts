import { z } from "zod"

import type { TouchpointKind } from "./rules"

/**
 * Quick log: the rules around the one-tap "Log touchpoint" dialog. Pure, so
 * the browser and the server share them.
 */

const quickLogSchema = z.object({
  donorId: z.string().uuid(),
  kind: z.string().min(1).max(60),
  note: z.string().max(5000).optional(),
})

export type QuickLogInput = { donorId: string; kind: string; note: string }

/**
 * Validate what the browser sent. Only these three fields survive: the
 * organisation, author, points and date are decided by the server.
 */
export function parseQuickLogInput(raw: unknown): QuickLogInput | null {
  const parsed = quickLogSchema.safeParse(raw)
  if (!parsed.success) return null
  return { donorId: parsed.data.donorId, kind: parsed.data.kind, note: (parsed.data.note ?? "").trim() }
}

/** Kinds written by the system or by other flows, never offered as a chip. */
const NOT_OFFERED = new Set(["task", "bulk_email", "receipt"])

/** The chips to show, smallest touch first (email → coffee), notes last. */
export function quickLogKinds(kinds: readonly TouchpointKind[]): TouchpointKind[] {
  return kinds
    .filter((k) => !NOT_OFFERED.has(k.key) && k.baseType !== "task")
    .sort((a, b) => {
      if ((a.points === 0) !== (b.points === 0)) return a.points === 0 ? 1 : -1
      return a.points - b.points
    })
}

/** How long after logging a touchpoint its author can undo it. */
export const UNDO_WINDOW_MS = 10 * 60 * 1000

export function canUndoTouchpoint(
  row: { createdBy: string | null; createdAt: string },
  userId: string,
  now: number = Date.now()
): boolean {
  if (!row.createdBy || row.createdBy !== userId) return false
  const created = Date.parse(row.createdAt)
  return Number.isFinite(created) && now - created <= UNDO_WINDOW_MS
}
