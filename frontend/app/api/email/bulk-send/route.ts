import { NextResponse } from "next/server"
import { Resend } from "resend"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"
const HOURLY_LIMIT = 10

type Recipient = {
  donorId: string
  donorEmail: string
  donorName?: string | null
}

export async function POST(request: Request) {
  const auth = await requireUserOrg()
  if (!auth.ok) {
    return auth.response
  }

  let body: { recipients: Recipient[]; subject: string; message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { recipients, subject, message } = body

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "recipients array is required" }, { status: 400 })
  }
  if (!subject?.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 })
  }
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Check rate limit
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: usedCount, error: rlError } = await supabase
    .from("email_send_log")
    .select("id", { count: "exact", head: true })
    .eq("org_id", auth.orgId)
    .gte("sent_at", oneHourAgo)

  if (rlError) {
    return NextResponse.json({ error: "Could not check rate limit" }, { status: 500 })
  }

  const used = usedCount ?? 0
  const remaining = HOURLY_LIMIT - used
  if (recipients.length > remaining) {
    return NextResponse.json(
      {
        error: `Rate limit: you can send ${remaining} more email${remaining === 1 ? "" : "s"} this hour (${HOURLY_LIMIT}/hr limit). You selected ${recipients.length} recipients.`,
        code: "RATE_LIMIT_EXCEEDED",
      },
      { status: 429 }
    )
  }

  // Validate all donors belong to org
  const donorIds = recipients.map((r) => r.donorId)
  const { data: validDonors, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .in("id", donorIds)
    .eq("org_id", auth.orgId)

  if (donorError) {
    return NextResponse.json({ error: "Failed to validate donors" }, { status: 500 })
  }

  const validIds = new Set((validDonors ?? []).map((d) => d.id))

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY)" },
      { status: 503 }
    )
  }

  const resend = new Resend(apiKey)
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const recipient of recipients) {
    if (!validIds.has(recipient.donorId)) {
      skipped++
      continue
    }
    if (!recipient.donorEmail?.trim()) {
      skipped++
      continue
    }

    // Resolve template variables per donor
    const personalizedMessage = message
      .replace(/\{\{donor_name\}\}/g, recipient.donorName ?? "")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    const personalizedSubject = subject
      .replace(/\{\{donor_name\}\}/g, recipient.donorName ?? "")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())

    try {
      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: recipient.donorEmail.trim(),
        subject: personalizedSubject.trim(),
        html: `<p>${personalizedMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`,
      })

      if (sendError) {
        console.error(`[email/bulk-send] Failed for ${recipient.donorEmail}:`, sendError.message)
        failed++
        continue
      }

      // Log for rate limiting and interaction tracking
      await Promise.all([
        supabase.from("email_send_log").insert({
          org_id: auth.orgId,
          sent_at: new Date().toISOString(),
        }),
        supabase.from("interactions").insert({
          donor_id: recipient.donorId,
          type: "email",
          direction: "outbound",
          subject: personalizedSubject.trim(),
          content: personalizedMessage.trim(),
          date: new Date().toISOString(),
        }),
      ])

      sent++
    } catch (err) {
      console.error(`[email/bulk-send] Unexpected error for ${recipient.donorEmail}:`, err)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, skipped })
}
