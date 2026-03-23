"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

/**
 * Check whether the current user has accepted the Terms of Service.
 */
export async function hasAcceptedTerms(): Promise<boolean> {
  const org = await getCurrentUserOrg()
  if (!org) return false

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("organization_members")
    .select("tos_accepted_at")
    .eq("user_id", org.userId)
    .eq("organization_id", org.orgId)
    .maybeSingle()

  if (error || !data) return false
  return data.tos_accepted_at != null
}

/**
 * Record that the current user accepted the Terms of Service and Privacy Policy.
 */
export async function acceptTerms(): Promise<{ success: boolean; error?: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { success: false, error: "Unauthorized" }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("organization_members")
    .update({ tos_accepted_at: new Date().toISOString() })
    .eq("user_id", org.userId)
    .eq("organization_id", org.orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
