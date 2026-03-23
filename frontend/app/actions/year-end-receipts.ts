"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrg } from "@/lib/auth"
import { logAuditEvent } from "@/app/actions/audit"

export type YearEndDonorSummary = {
  donorId: string
  displayName: string
  email: string | null
  totalGiving: number
  donationCount: number
  firstDate: string
  lastDate: string
}

/**
 * Get all donors with donations for a given tax year, with giving totals.
 * Used to preview before sending year-end receipts.
 */
export async function getYearEndSummaries(
  year: number
): Promise<YearEndDonorSummary[]> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  const supabase = createAdminClient()

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const { data: donations, error } = await supabase
    .from("donations")
    .select("donor_id, amount, date")
    .eq("org_id", org.orgId)
    .gte("date", yearStart)
    .lte("date", yearEnd)
    .order("date", { ascending: true })

  if (error) throw new Error(error.message)
  if (!donations || donations.length === 0) return []

  // Aggregate by donor
  const byDonor = new Map<
    string,
    { total: number; count: number; firstDate: string; lastDate: string }
  >()

  for (const d of donations) {
    const existing = byDonor.get(d.donor_id)
    const amount = Number(d.amount) || 0
    const date = d.date ?? ""
    if (existing) {
      existing.total += amount
      existing.count += 1
      if (date < existing.firstDate) existing.firstDate = date
      if (date > existing.lastDate) existing.lastDate = date
    } else {
      byDonor.set(d.donor_id, {
        total: amount,
        count: 1,
        firstDate: date,
        lastDate: date,
      })
    }
  }

  // Fetch donor info
  const donorIds = [...byDonor.keys()]
  const { data: donors } = await supabase
    .from("donors")
    .select("id, display_name, email")
    .eq("org_id", org.orgId)
    .in("id", donorIds)

  const donorMap = new Map(
    (donors ?? []).map((d) => [d.id, d])
  )

  const summaries: YearEndDonorSummary[] = []
  for (const [donorId, agg] of byDonor) {
    const donor = donorMap.get(donorId)
    if (!donor) continue
    summaries.push({
      donorId,
      displayName: donor.display_name ?? "Unknown",
      email: donor.email,
      totalGiving: agg.total,
      donationCount: agg.count,
      firstDate: agg.firstDate,
      lastDate: agg.lastDate,
    })
  }

  // Sort by total giving descending
  summaries.sort((a, b) => b.totalGiving - a.totalGiving)
  return summaries
}

export type SendYearEndReceiptsResult = {
  sent: number
  skipped: number
  errors: Array<{ donorName: string; error: string }>
}

/**
 * Send year-end tax receipt emails to selected donors.
 * Uses Resend API and logs each send as an interaction.
 */
export async function sendYearEndReceipts(input: {
  year: number
  donorIds: string[]
  subject: string
  bodyTemplate: string
  orgName: string
}): Promise<SendYearEndReceiptsResult> {
  const org = await getCurrentUserOrg()
  if (!org) throw new Error("Unauthorized")

  if (input.donorIds.length === 0) return { sent: 0, skipped: 0, errors: [] }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error("Email sending is not configured (RESEND_API_KEY)")

  const supabase = createAdminClient()
  const summaries = await getYearEndSummaries(input.year)

  const summaryMap = new Map(summaries.map((s) => [s.donorId, s]))

  const { Resend } = await import("resend")
  const resend = new Resend(apiKey)

  let sent = 0
  let skipped = 0
  const errors: Array<{ donorName: string; error: string }> = []

  for (const donorId of input.donorIds) {
    const summary = summaryMap.get(donorId)
    if (!summary) {
      skipped++
      continue
    }

    if (!summary.email) {
      skipped++
      errors.push({ donorName: summary.displayName, error: "No email address" })
      continue
    }

    // Replace template variables
    const body = input.bodyTemplate
      .replace(/\{\{donor_name\}\}/g, summary.displayName)
      .replace(/\{\{org_name\}\}/g, input.orgName)
      .replace(/\{\{year\}\}/g, String(input.year))
      .replace(/\{\{total_giving\}\}/g, formatCurrency(summary.totalGiving))
      .replace(/\{\{donation_count\}\}/g, String(summary.donationCount))
      .replace(/\{\{first_date\}\}/g, formatShortDate(summary.firstDate))
      .replace(/\{\{last_date\}\}/g, formatShortDate(summary.lastDate))

    const subject = input.subject
      .replace(/\{\{donor_name\}\}/g, summary.displayName)
      .replace(/\{\{org_name\}\}/g, input.orgName)
      .replace(/\{\{year\}\}/g, String(input.year))

    try {
      await resend.emails.send({
        from: "Vantage <notifications@vantagedonorai.com>",
        to: summary.email,
        subject,
        html: `<p>${body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`,
      })

      // Log as interaction
      await supabase.from("interactions").insert({
        donor_id: donorId,
        type: "email",
        direction: "outbound",
        subject,
        content: `Year-end tax receipt for ${input.year}`,
        date: new Date().toISOString(),
      })

      // Log email send for rate limiting
      await supabase.from("email_send_log").insert({
        org_id: org.orgId,
        sent_at: new Date().toISOString(),
      })

      sent++
    } catch (e) {
      errors.push({
        donorName: summary.displayName,
        error: e instanceof Error ? e.message : "Send failed",
      })
    }
  }

  await logAuditEvent({
    orgId: org.orgId,
    userId: org.userId,
    action: "email_send",
    entityType: "donor",
    summary: `Sent ${sent} year-end tax receipt${sent === 1 ? "" : "s"} for ${input.year}`,
    details: { year: input.year, sent, skipped, errorCount: errors.length },
  })

  return { sent, skipped, errors }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
