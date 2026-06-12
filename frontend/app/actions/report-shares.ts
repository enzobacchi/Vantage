"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrgWithRole } from "@/lib/auth"

export async function getReportShares(reportId: string): Promise<string[]> {
  const org = await getCurrentUserOrgWithRole()
  if (!org) return []

  const supabase = createAdminClient()

  // Verify the report belongs to the user's org
  const { data: report } = await supabase
    .from("saved_reports")
    .select("id")
    .eq("id", reportId)
    .eq("organization_id", org.orgId)
    .maybeSingle()

  if (!report) return []

  const { data } = await supabase
    .from("report_shares")
    .select("user_id")
    .eq("report_id", reportId)

  return (data ?? []).map((r) => r.user_id)
}

export async function updateReportShares(
  reportId: string,
  userIds: string[]
): Promise<{ error?: string }> {
  const org = await getCurrentUserOrgWithRole()
  if (!org) return { error: "Unauthorized" }

  const supabase = createAdminClient()

  // Verify the report belongs to the user's org and the user is the creator
  const { data: report } = await supabase
    .from("saved_reports")
    .select("id, created_by_user_id")
    .eq("id", reportId)
    .eq("organization_id", org.orgId)
    .maybeSingle()

  if (!report) return { error: "Report not found" }
  // Creator-only. Legacy rows with a null creator are owner/admin-only (so a
  // plain member can't take over sharing of an unowned report).
  if (report.created_by_user_id) {
    if (report.created_by_user_id !== org.userId) {
      return { error: "Only the report creator can manage sharing" }
    }
  } else if (org.role !== "owner" && org.role !== "admin") {
    return { error: "Only the report creator can manage sharing" }
  }

  // Only share with real members of this org — never insert arbitrary user ids.
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", org.orgId)
  const memberIds = new Set((members ?? []).map((m) => m.user_id))
  const validUserIds = userIds.filter((uid) => memberIds.has(uid))

  // Replace all shares: delete existing, insert new
  await supabase.from("report_shares").delete().eq("report_id", reportId)

  if (validUserIds.length > 0) {
    const { error } = await supabase.from("report_shares").insert(
      validUserIds.map((uid) => ({ report_id: reportId, user_id: uid }))
    )
    if (error) return { error: error.message }
  }

  // Update visibility to "specific" if sharing with users, or back to "private" if none
  await supabase
    .from("saved_reports")
    .update({ visibility: validUserIds.length > 0 ? "specific" : "private" })
    .eq("id", reportId)

  return {}
}
