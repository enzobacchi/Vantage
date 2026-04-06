"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export async function getReportShares(reportId: string): Promise<string[]> {
  const org = await getCurrentUserOrg()
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
  const org = await getCurrentUserOrg()
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
  if (report.created_by_user_id && report.created_by_user_id !== org.userId) {
    return { error: "Only the report creator can manage sharing" }
  }

  // Replace all shares: delete existing, insert new
  await supabase.from("report_shares").delete().eq("report_id", reportId)

  if (userIds.length > 0) {
    const { error } = await supabase.from("report_shares").insert(
      userIds.map((uid) => ({ report_id: reportId, user_id: uid }))
    )
    if (error) return { error: error.message }
  }

  // Update visibility to "specific" if sharing with users, or back to "private" if none
  await supabase
    .from("saved_reports")
    .update({ visibility: userIds.length > 0 ? "specific" : "private" })
    .eq("id", reportId)

  return {}
}
