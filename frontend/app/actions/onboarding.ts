"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

/**
 * Check whether the current org has completed onboarding.
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  const org = await getCurrentUserOrg()
  if (!org) return true // don't block unauthenticated users with wizard

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("organizations")
    .select("onboarding_completed_at")
    .eq("id", org.orgId)
    .maybeSingle()

  if (error || !data) return true
  return data.onboarding_completed_at != null
}

/**
 * Mark onboarding as completed for the current org.
 */
export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  const org = await getCurrentUserOrg()
  if (!org) return { success: false, error: "Unauthorized" }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("organizations")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", org.orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
