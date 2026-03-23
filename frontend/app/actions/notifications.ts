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

  // Upsert to handle case where preferences don't exist yet
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        org_id: org.orgId,
        user_id: org.userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,user_id" }
    )

  if (error) throw new Error(error.message)
}
