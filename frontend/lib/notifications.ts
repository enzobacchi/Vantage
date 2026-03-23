/**
 * Notification email delivery.
 * Checks user preferences and sends emails via Resend.
 * All public functions are designed to be called fire-and-forget.
 */

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import type { NotificationPreferences } from "@/types/database"
import {
  newDonationEmailHtml,
  milestoneEmailHtml,
  teamActivityEmailHtml,
  systemAlertEmailHtml,
} from "@/lib/email-templates"

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"

const MILESTONE_THRESHOLDS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MemberWithPrefs = {
  userId: string
  email: string
  name: string
  prefs: NotificationPreferences
}

/**
 * Fetch all org members with their notification preferences and emails.
 * Uses the admin client + auth.admin.getUserById pattern from team.ts.
 */
export async function getOrgMembersWithPreferences(orgId: string): Promise<MemberWithPrefs[]> {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)

  if (!rows?.length) return []

  const members: MemberWithPrefs[] = []

  for (const row of rows) {
    const { data: userData } = await admin.auth.admin.getUserById(row.user_id)
    const user = userData?.user
    const email = user?.email
    if (!email) continue

    const name =
      (user.user_metadata?.full_name as string) ??
      (user.user_metadata?.name as string) ??
      email.split("@")[0]

    // Fetch or create preferences
    let prefs: NotificationPreferences | null = null
    const { data: existing } = await admin
      .from("notification_preferences")
      .select("*")
      .eq("org_id", orgId)
      .eq("user_id", row.user_id)
      .maybeSingle()

    if (existing) {
      prefs = existing as NotificationPreferences
    } else {
      // Create default preferences (most email notifications ON by default)
      const { data: created } = await admin
        .from("notification_preferences")
        .insert({ org_id: orgId, user_id: row.user_id })
        .select("*")
        .single()
      prefs = (created as NotificationPreferences) ?? null
    }

    if (!prefs) continue

    members.push({ userId: row.user_id, email, name: String(name).trim() || email.split("@")[0], prefs })
  }

  return members
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[notifications] RESEND_API_KEY not set, skipping email to", to)
    return
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html })
  if (error) {
    console.error("[notifications] failed to send to", to, error.message)
  }
}

// ---------------------------------------------------------------------------
// Notification senders
// ---------------------------------------------------------------------------

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/**
 * Notify org members about a new donation.
 * Fire-and-forget — does not throw.
 */
export async function notifyNewDonation(
  orgId: string,
  donorName: string,
  amount: number,
  donorId: string
): Promise<void> {
  const members = await getOrgMembersWithPreferences(orgId)
  const profileUrl = `${getAppUrl()}/dashboard/donors/${donorId}`
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  const html = newDonationEmailHtml(donorName, amount, date, profileUrl)
  const subject = `New donation: ${donorName} gave ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)}`

  for (const m of members) {
    if (m.prefs.email_new_donation) {
      await sendEmail(m.email, subject, html)
    }
  }
}

/**
 * Notify org members about a donor reaching a giving milestone.
 */
export async function notifyDonorMilestone(
  orgId: string,
  donorName: string,
  milestone: number,
  totalGiving: number,
  donorId: string
): Promise<void> {
  const members = await getOrgMembersWithPreferences(orgId)
  const profileUrl = `${getAppUrl()}/dashboard/donors/${donorId}`
  const html = milestoneEmailHtml(donorName, milestone, totalGiving, profileUrl)
  const fmtMilestone = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(milestone)
  const subject = `Milestone: ${donorName} crossed ${fmtMilestone} in lifetime giving`

  for (const m of members) {
    if (m.prefs.email_donor_milestone) {
      await sendEmail(m.email, subject, html)
    }
  }
}

/**
 * Check if a donation crossed any milestone thresholds and send notifications.
 */
export async function checkAndNotifyMilestones(
  orgId: string,
  donorId: string,
  donorName: string,
  previousTotal: number,
  newTotal: number
): Promise<void> {
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (previousTotal < threshold && newTotal >= threshold) {
      await notifyDonorMilestone(orgId, donorName, threshold, newTotal, donorId)
      break // Only notify for the highest crossed threshold
    }
  }
}

/**
 * Notify org members about team activity.
 */
export async function notifyTeamActivity(
  orgId: string,
  actorName: string,
  action: string,
  detail: string
): Promise<void> {
  const members = await getOrgMembersWithPreferences(orgId)
  const html = teamActivityEmailHtml(actorName, action, detail)
  const subject = `Team activity: ${actorName} ${action}`

  for (const m of members) {
    if (m.prefs.email_team_activity) {
      await sendEmail(m.email, subject, html)
    }
  }
}

/**
 * Notify org members about a system alert (sync failure, payment issue, etc.).
 */
export async function notifySystemAlert(
  orgId: string,
  alertSubject: string,
  detail: string
): Promise<void> {
  const members = await getOrgMembersWithPreferences(orgId)
  const html = systemAlertEmailHtml(alertSubject, detail)

  for (const m of members) {
    if (m.prefs.email_system_alerts) {
      await sendEmail(m.email, `Vantage alert: ${alertSubject}`, html)
    }
  }
}
