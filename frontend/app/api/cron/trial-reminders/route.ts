import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { trialEndingEmailHtml } from "@/lib/email-templates"

export const runtime = "nodejs"
export const maxDuration = 120

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"

/**
 * Daily cron — finds trialing subscriptions ending in ~7 days and emails the org
 * owner a "trial ending" reminder with a CTA to upgrade. Stamps
 * trial_reminder_sent_at so a given subscription only gets the reminder once.
 *
 * Fires from Vercel Cron (see vercel.json). Auth via CRON_SECRET header.
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vantagedonorai.com"
  const admin = createAdminClient()
  const resend = new Resend(apiKey)

  // Window: trials ending between now + 6.5d and now + 7.5d. The ~1-day window
  // tolerates cron slippage and missed runs without double-sending (the
  // trial_reminder_sent_at idempotency stamp handles the rest).
  const now = Date.now()
  const windowStart = new Date(now + 6.5 * 24 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now + 7.5 * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error: queryError } = await admin
    .from("subscriptions")
    .select("id, org_id, trial_ends_at")
    .eq("status", "trialing")
    .is("trial_reminder_sent_at", null)
    .gte("trial_ends_at", windowStart)
    .lte("trial_ends_at", windowEnd)

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  if (!candidates?.length) {
    return NextResponse.json({ sent: 0, candidates: 0 })
  }

  let totalSent = 0
  const errors: string[] = []

  for (const sub of candidates) {
    if (!sub.trial_ends_at) continue
    try {
      // Find the owner of the org.
      const { data: owner } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", sub.org_id)
        .eq("role", "owner")
        .limit(1)
        .single()

      if (!owner?.user_id) {
        errors.push(`org ${sub.org_id}: no owner found`)
        continue
      }

      const { data: userRes } = await admin.auth.admin.getUserById(owner.user_id)
      const email = userRes?.user?.email
      if (!email) {
        errors.push(`org ${sub.org_id}: owner has no email`)
        continue
      }

      const fullName = (userRes.user?.user_metadata?.full_name as string | undefined) ?? null
      const firstName = fullName?.split(" ")[0] ?? null

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "Your Vantage trial ends in 7 days",
        html: trialEndingEmailHtml({
          firstName,
          trialEndsAt: sub.trial_ends_at,
          upgradeUrl: `${appUrl}/settings?tab=billing`,
        }),
      })

      await admin
        .from("subscriptions")
        .update({ trial_reminder_sent_at: new Date().toISOString() })
        .eq("id", sub.id)

      totalSent++
    } catch (e) {
      errors.push(`sub ${sub.id}: ${e instanceof Error ? e.message : "Unknown"}`)
    }
  }

  return NextResponse.json({
    sent: totalSent,
    candidates: candidates.length,
    errors: errors.slice(0, 10),
  })
}
