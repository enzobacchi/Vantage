"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type OnboardingProgress = {
  hasDonors: boolean
  hasQBConnected: boolean
  hasSentEmail: boolean
  hasTemplate: boolean
}

/**
 * Check which onboarding milestones the current org has completed.
 */
export async function getOnboardingProgress(): Promise<OnboardingProgress> {
  const org = await getCurrentUserOrg()
  if (!org) {
    return { hasDonors: false, hasQBConnected: false, hasSentEmail: false, hasTemplate: false }
  }

  const supabase = createAdminClient()

  const [donorsRes, orgRes, emailRes, templateRes] = await Promise.all([
    supabase
      .from("donors")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId)
      .limit(1),
    supabase
      .from("organizations")
      .select("qb_realm_id")
      .eq("id", org.orgId)
      .maybeSingle(),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId)
      .eq("type", "email")
      .limit(1),
    supabase
      .from("receipt_templates")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId)
      .limit(1),
  ])

  return {
    hasDonors: (donorsRes.count ?? 0) > 0,
    hasQBConnected: orgRes.data?.qb_realm_id != null,
    hasSentEmail: (emailRes.count ?? 0) > 0,
    hasTemplate: (templateRes.count ?? 0) > 0,
  }
}
