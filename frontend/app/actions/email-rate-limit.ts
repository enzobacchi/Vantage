"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"

const HOURLY_LIMIT = 50

export type EmailRateLimit = {
  used: number
  limit: number
  remaining: number
  resetsAt: string
}

/**
 * Check how many emails the current user has sent in the last hour.
 * Limit is per-user since each user sends from their own connected Gmail.
 */
export async function getEmailRateLimit(): Promise<EmailRateLimit> {
  const org = await getCurrentUserOrg()
  if (!org) {
    return { used: 0, limit: HOURLY_LIMIT, remaining: HOURLY_LIMIT, resetsAt: new Date().toISOString() }
  }

  const supabase = createAdminClient()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from("email_send_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", org.userId)
    .gte("sent_at", oneHourAgo)

  const used = count ?? 0
  return {
    used,
    limit: HOURLY_LIMIT,
    remaining: Math.max(0, HOURLY_LIMIT - used),
    resetsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}
