import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgMembersWithPreferences } from "@/lib/notifications"
import { weeklyDigestEmailHtml } from "@/lib/email-templates"
import { findFirstTimeDonorIds, generateDigestAISummary, type DigestAISummary } from "@/lib/digest-ai"
import { getDigestWindow } from "@/lib/digest-window"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import { Resend } from "resend"
import { isAuthorizedCron } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const maxDuration = 120

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"

/**
 * Weekly digest cron — sends a summary of the past 7 days to opted-in org members.
 * Runs every Monday at 2 PM UTC (Vercel cron).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 })
  }

  const admin = createAdminClient()
  const resend = new Resend(apiKey)

  // Get all active orgs
  const { data: orgs } = await admin.from("organizations").select("id, name")
  if (!orgs?.length) {
    return NextResponse.json({ message: "No organizations found", sent: 0 })
  }

  const digestWindow = getDigestWindow(new Date())

  let totalSent = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const org of orgs) {
    try {
      const members = await getOrgMembersWithPreferences(org.id)
      const digestMembers = members.filter((m) => m.prefs.email_weekly_digest)
      if (digestMembers.length === 0) continue

      // Donations given in the 7 full days before today, by actual gift date
      // (not record creation). Throws on error so the org is skipped rather
      // than emailed a $0 total.
      const donations = await fetchAllRows<{ amount: number; donor_id: string | null }>((from, to) =>
        admin
          .from("donations")
          .select("amount, donor_id")
          .eq("org_id", org.id)
          .gte("date", digestWindow.start)
          .lt("date", digestWindow.end)
          .order("id")
          .range(from, to)
      )
      const donationCount = donations.length
      const donationTotal = donations.reduce((sum, d) => sum + Number(d.amount || 0), 0)

      // "New donor this week" = a donor whose first-ever gift date falls in the window.
      const newDonorCount = (
        await findFirstTimeDonorIds(admin, org.id, donations.map((d) => d.donor_id), digestWindow.start)
      ).size

      const orgName = (org.name as string) || "Your Organization"

      // Generate AI summary with 15s timeout — falls back to null on any failure
      let aiSummary: DigestAISummary | null = null
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        try {
          aiSummary = await generateDigestAISummary(org.id, admin, digestWindow, controller.signal)
        } finally {
          clearTimeout(timeout)
        }
      } catch (err) {
        console.error("[digest] AI summary failed for org", org.id, err)
        aiSummary = null
      }

      const html = weeklyDigestEmailHtml(
        orgName,
        {
          donationCount,
          donationTotal,
          newDonorCount,
          milestoneDonors: [],
        },
        aiSummary
      )

      const subject = aiSummary
        ? `Your Weekly AI Summary — ${orgName}`
        : `Weekly Digest — ${orgName}`

      for (const m of digestMembers) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: m.email,
            subject,
            html,
          })
          totalSent++
        } catch (e) {
          errors.push(`${m.email}: ${e instanceof Error ? e.message : "Unknown"}`)
        }
      }
    } catch (e) {
      totalSkipped++
      errors.push(`org ${org.id}: ${e instanceof Error ? e.message : "Unknown"}`)
    }
  }

  return NextResponse.json({
    sent: totalSent,
    skipped: totalSkipped,
    errors: errors.slice(0, 10),
  })
}
