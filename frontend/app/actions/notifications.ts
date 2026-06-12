"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import type { NotificationPreferences } from "@/types/database"

export type NotificationPrefsUpdate = {
  email_new_donation?: boolean
  email_donor_milestone?: boolean
  email_weekly_digest?: boolean
  email_team_activity?: boolean
  email_system_alerts?: boolean
  inapp_new_donation?: boolean
  inapp_task_reminders?: boolean
  inapp_donor_lapsed?: boolean
}

/**
 * Get notification preferences for the current user.
 * Creates default preferences if none exist.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("org_id", org.orgId)
    .eq("user_id", org.userId)
    .maybeSingle()

  if (existing) return existing as NotificationPreferences

  // Create default preferences
  const { data: created, error } = await supabase
    .from("notification_preferences")
    .insert({
      org_id: org.orgId,
      user_id: org.userId,
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return created as NotificationPreferences
}

/**
 * Update notification preferences for the current user.
 */
export async function updateNotificationPreferences(
  updates: NotificationPrefsUpdate
): Promise<void> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  // Allowlist only the known boolean keys — `updates` is attacker-controlled
  // at runtime, and a raw spread after org_id/user_id would let a crafted
  // payload overwrite another user's preferences (later keys win).
  const row: Record<string, unknown> = {
    org_id: org.orgId,
    user_id: org.userId,
    updated_at: new Date().toISOString(),
  }
  const BOOLEAN_KEYS: (keyof NotificationPrefsUpdate)[] = [
    "email_new_donation",
    "email_donor_milestone",
    "email_weekly_digest",
    "email_team_activity",
    "email_system_alerts",
    "inapp_new_donation",
    "inapp_task_reminders",
    "inapp_donor_lapsed",
  ]
  for (const key of BOOLEAN_KEYS) {
    if (typeof updates[key] === "boolean") row[key] = updates[key]
  }

  // Upsert to handle case where preferences don't exist yet
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(row, { onConflict: "org_id,user_id" })

  if (error) throw new Error(error.message)
}
