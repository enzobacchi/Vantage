import { createHash } from "node:crypto"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * Server-side half of the chat write-confirm gate (see PROJECT_CONTEXT.md →
 * "Chat write-confirm gate"). A gated write tool (`create_donor`,
 * `create_donation`) may only run with `confirm: true` for the exact change
 * it previewed in an EARLIER, FINISHED chat request, i.e. after the user sent
 * another message. So the model can't preview-and-write within one request,
 * act on injected instructions, change the arguments after the user saw them,
 * revive a preview from several turns back, or write the same change twice.
 *
 * Lifecycle of a preview in `chat_pending_writes` (a hash, never the details):
 *   record()   → row inserted, not ready (its request is still streaming)
 *   finalize() → when that request finishes, its rows become ready; any change
 *                it already wrote is dropped so it can't be approved again
 *   open       → the user's next request takes (deletes) their ready rows;
 *                consume() approves each one once, in that request only
 * Rows of a request still in flight are never taken, so a second tab, device
 * or double-tap can't use or destroy them. Remembered server-side because
 * mobile and reloaded web chat send history back as text only.
 *
 * What this does not check: whether the user's reply actually said yes. That
 * is still the model's job (system prompt); a Confirm button in the chat UI
 * would close it. Approvals are also lost if the follow-up request fails
 * mid-stream; the model then shows the preview again.
 */

/** How long a preview stays approvable (it also expires after one request). */
export const PREVIEW_TTL_MS = 30 * 60 * 1000

/** Preview fields that are display-only and not part of what gets written. */
const DISPLAY_ONLY = new Set(["donor_name"])

function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim()
  return value ?? null
}

/** Stable identity of a previewed change: tool + written fields, order-independent. */
export function previewKey(tool: string, fields: Record<string, unknown>): string {
  const entries = Object.keys(fields)
    .filter((k) => !DISPLAY_ONLY.has(k) && k !== "confirm")
    .sort()
    .map((k) => [k, normalize(fields[k])])
  return `${tool}:${JSON.stringify(entries)}`
}

const hashKey = (tool: string, fields: Record<string, unknown>) =>
  createHash("sha256").update(previewKey(tool, fields)).digest("hex")

export type ConfirmGate = {
  /** Remember a preview shown in this request. False if it couldn't be saved. */
  record(tool: string, fields: Record<string, unknown>): Promise<boolean>
  /** True once for a change previewed in an earlier finished request. */
  consume(tool: string, fields: Record<string, unknown>): boolean
  /** Call when this request finishes: makes its previews approvable next time. */
  finalize(): Promise<void>
}

/** Approves nothing. Used when no gate is wired in (fails closed). */
export const CLOSED_GATE: ConfirmGate = {
  record: async () => false,
  consume: () => false,
  finalize: async () => {},
}

type GateAdmin = ReturnType<typeof createAdminClient>

/**
 * Open the gate for one chat request. Takes (deletes) this user's ready
 * previews in this org, plus any expired leftovers; the unexpired ready ones
 * are what this request may write. Unused approvals are gone afterwards, so an
 * approval lives for exactly one follow-up message.
 */
export async function openConfirmGate(
  admin: GateAdmin,
  ctx: { orgId: string; userId: string; requestId: string; now?: Date }
): Promise<ConfirmGate> {
  const now = ctx.now ?? new Date()
  const approved = new Set<string>()
  const consumed = new Set<string>()
  let recorded = false

  const { data, error } = await admin
    .from("chat_pending_writes")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .or(`ready.eq.true,expires_at.lt.${now.toISOString()}`)
    .select("key_hash, request_id, ready, expires_at")
  if (error) {
    // Fail closed: nothing is approvable this request; previews still work.
    console.error("[confirm-gate] could not load pending writes:", error.message)
  }
  for (const row of (data ?? []) as Array<{ key_hash: string; request_id: string; ready: boolean; expires_at: string }>) {
    if (row.ready && row.request_id !== ctx.requestId && new Date(row.expires_at) > now) approved.add(row.key_hash)
  }

  return {
    async record(tool, fields) {
      const key = hashKey(tool, fields)
      // Already written in this request: showing it again must not re-arm it.
      if (consumed.has(key)) return true
      const { error: insertError } = await admin.from("chat_pending_writes").insert({
        org_id: ctx.orgId,
        user_id: ctx.userId,
        request_id: ctx.requestId,
        key_hash: key,
        expires_at: new Date(now.getTime() + PREVIEW_TTL_MS).toISOString(),
      })
      if (insertError) console.error("[confirm-gate] could not record preview:", insertError.message)
      else recorded = true
      return !insertError
    },
    consume(tool, fields) {
      const key = hashKey(tool, fields)
      if (!approved.has(key)) return false
      approved.delete(key)
      consumed.add(key)
      return true
    },
    async finalize() {
      if (!recorded) return
      if (consumed.size > 0) {
        const { error: dropError } = await admin
          .from("chat_pending_writes")
          .delete()
          .eq("request_id", ctx.requestId)
          .in("key_hash", [...consumed])
        if (dropError) {
          // Don't make anything approvable we can't prove wasn't just written.
          console.error("[confirm-gate] could not drop written previews:", dropError.message)
          return
        }
      }
      const { error: readyError } = await admin
        .from("chat_pending_writes")
        .update({ ready: true })
        .eq("request_id", ctx.requestId)
      if (readyError) console.error("[confirm-gate] could not finalize previews:", readyError.message)
    },
  }
}
