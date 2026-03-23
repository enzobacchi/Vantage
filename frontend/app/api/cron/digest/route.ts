import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgMembersWithPreferences } from "@/lib/notifications"
import { weeklyDigestEmailHtml } from "@/lib/email-templates"
import { generateDigestAISummary, type DigestAISummary } from "@/lib/digest-ai"
import { Resend } from "resend"

export const runtime = "nodejs"
export const maxDuration = 120

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"

/**
 * Weekly digest cron — sends a summary of the past 7 days to opted-in org members.
 * Runs every Monday at 2 PM UTC (Vercel cron).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const since = sevenDaysAgo.toISOString()

  let totalSent = 0
  let totalSkipped = 0
  const errors: string[] = []

  for (const org of orgs) {
    try {
      const members = await getOrgMembersWithPreferences(org.id)
      const digestMembers = members.filter((m) => m.prefs.email_weekly_digest)
      if (digestMembers.length === 0) continue

      // Compile stats for the past 7 days
      const [donationResult, newDonorResult] = await Promise.all([
        admin
          .from("donations")
          .select("amount")
          .eq("org_id", org.id)
          .gte("created_at", since),
        admin
          .from("donors")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org.id)
          .gte("created_at", since),
      ])

      const donations = (donationResult.data ?? []) as { amount: number }[]
      const donationCount = donations.length
      const donationTotal = donations.reduce((sum, d) => sum + Number(d.amount || 0), 0)
      const newDonorCount = newDonorResult.count ?? 0

      const orgName = (org.name as string) || "Your Organization"

      // Generate AI summary with 15s timeout — falls back to null on any failure
      let aiSummary: DigestAISummary | null = null
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)
        aiSummary = await generateDigestAISummary(org.id, admin, since, controller.signal)
        clearTimeout(timeout)
      } catch {
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
