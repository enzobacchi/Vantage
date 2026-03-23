"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg, getCurrentUserOrgWithRole } from "@/lib/auth"
import type { AuditLog } from "@/types/database"

/**
 * Log an auditable action. Call this from other server actions after mutations.
 * Does NOT throw on failure — audit logging should never block the primary operation.
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

export type AuditLogEntry = AuditLog & {
  user_email?: string | null
}

/**
 * Fetch paginated audit logs for the current organization.
 * Owner/admin see all; members see only their own actions.
 */
export async function getAuditLogs(options?: {
  page?: number
  limit?: number
  entityType?: string
}): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const org = await getCurrentUserOrgWithRole()
  if (!org) return { logs: [], total: 0 }

  const page = options?.page ?? 0
  const limit = Math.min(options?.limit ?? 50, 100)
  const offset = page * limit

  const supabase = createAdminClient()

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("org_id", org.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  // Members can only see their own actions
  if (org.role === "member") {
    query = query.eq("user_id", org.userId)
  }

  if (options?.entityType) {
    query = query.eq("entity_type", options.entityType)
  }

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  return {
    logs: (data ?? []) as AuditLogEntry[],
    total: count ?? 0,
  }
}
