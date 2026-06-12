"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrgWithRole } from "@/lib/auth"
import type { AuditLog } from "@/types/database"

// NOTE: logAuditEvent moved to lib/audit.ts — it must not be a callable server
// action (it would let any client forge audit entries into an arbitrary org).

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
