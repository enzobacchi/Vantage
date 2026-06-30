"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

export type DashboardPreferences = {
  show_metric_cards: boolean
  show_smart_actions: boolean
  show_donations_chart: boolean
  show_recent_gifts: boolean
  show_top_donors: boolean
}

const DEFAULTS: DashboardPreferences = {
  show_metric_cards: true,
  show_smart_actions: true,
  show_donations_chart: true,
  show_recent_gifts: true,
  show_top_donors: true,
}

export async function getDashboardPreferences(): Promise<DashboardPreferences> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from("dashboard_preferences")
    .select("*")
    .eq("org_id", org.orgId)
    .eq("user_id", org.userId)
    .maybeSingle()

  if (existing) {
    return {
      show_metric_cards: existing.show_metric_cards,
      show_smart_actions: existing.show_smart_actions,
      show_donations_chart: existing.show_donations_chart,
      show_recent_gifts: existing.show_recent_gifts,
      show_top_donors: existing.show_top_donors,
    }
  }

  // Create default preferences
  const { error } = await supabase
    .from("dashboard_preferences")
    .insert({ org_id: org.orgId, user_id: org.userId })

  if (error) throw new Error(error.message)
  return DEFAULTS
}

export async function updateDashboardPreferences(
  updates: Partial<DashboardPreferences>
): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  // Allowlist only the five known boolean keys — `updates` is attacker-
  // controlled at runtime, and a raw spread after org_id/user_id would let a
  // crafted payload overwrite another user's row (the later keys win).
  const row: Record<string, unknown> = {
    org_id: org.orgId,
    user_id: org.userId,
    updated_at: new Date().toISOString(),
  }
  const BOOLEAN_KEYS: (keyof DashboardPreferences)[] = [
    "show_metric_cards",
    "show_smart_actions",
    "show_donations_chart",
    "show_recent_gifts",
    "show_top_donors",
  ]
  for (const key of BOOLEAN_KEYS) {
    if (typeof updates[key] === "boolean") row[key] = updates[key]
  }

  const { error } = await supabase
    .from("dashboard_preferences")
    .upsert(row, { onConflict: "org_id,user_id" })

  if (error) throw new Error(error.message)
}
