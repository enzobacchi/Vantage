import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Log an auditable action. Called from server actions *after* they have
 * authenticated and resolved the org — callers pass the orgId/userId they
 * already derived from getCurrentUserOrg().
 *
 * This deliberately lives in lib/ (not app/actions/) so it is NOT exposed as
 * a callable server action endpoint — otherwise any client could forge audit
 * entries into an arbitrary org by passing a chosen orgId/userId.
 *
 * Does NOT throw on failure — audit logging must never block the primary op.
 */
export async function logAuditEvent(input: {
  orgId: string
  userId: string
  action: string
  entityType: string
  entityId?: string | null
  summary: string
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from("audit_logs").insert({
      org_id: input.orgId,
      user_id: input.userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      details: input.details ?? {},
    })
  } catch (e) {
    console.error("[audit] Failed to log event:", e)
  }
}
