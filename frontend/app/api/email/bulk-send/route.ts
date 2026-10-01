import { NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { emailEnabledServer } from "@/lib/features"
import {
  GmailNeedsReauthError,
  GmailNotConnectedError,
  sendGmailMessage,
} from "@/lib/gmail/send"

export const runtime = "nodejs"

const HOURLY_LIMIT = 50

type Recipient = {
  donorId: string
  donorEmail: string
  donorName?: string | null
}

type FailedRecipient = {
  donorId: string
  donorEmail: string
  error: string
}

export async function POST(request: Request) {
  if (!emailEnabledServer) {
    return NextResponse.json(
      { error: "Email sending is not enabled" },
      { status: 403 }
    )
  }

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

  // Per-user rate limit
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: usedCount, error: rlError } = await supabase
    .from("email_send_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .gte("sent_at", oneHourAgo)

  if (rlError) {
    return NextResponse.json({ error: "Could not check rate limit" }, { status: 500 })
  }

  const used = usedCount ?? 0
  const remaining = HOURLY_LIMIT - used
  if (recipients.length > remaining) {
    return NextResponse.json(
      {
        error: `Rate limit: you can send ${remaining} more email${remaining === 1 ? "" : "s"} this hour (${HOURLY_LIMIT}/hr per user). You selected ${recipients.length} recipients.`,
        code: "RATE_LIMIT_EXCEEDED",
      },
      { status: 429 }
    )
  }

  // Validate all donors belong to org, and pull the email + name from the
  // verified row — never trust the body-supplied address (prevents sending to
  // arbitrary addresses and CRLF header injection into the To: field).
  const donorIds = recipients.map((r) => r.donorId)
  const { data: validDonors, error: donorError } = await supabase
    .from("donors")
    .select("id, email, display_name")
    .in("id", donorIds)
    .eq("org_id", auth.orgId)

  if (donorError) {
    return NextResponse.json({ error: "Failed to validate donors" }, { status: 500 })
  }

  const donorById = new Map(
    (validDonors ?? []).map((d) => [
      d.id,
      { email: d.email as string | null, name: d.display_name as string | null },
    ])
  )
  const validIds = new Set(donorById.keys())

  let sent = 0
  const failed: FailedRecipient[] = []
  let skipped = 0

  // Reject anything that isn't a clean single-line email (no CRLF → no header
  // injection into the raw RFC-822 To: field).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  for (const recipient of recipients) {
    const donor = donorById.get(recipient.donorId)
    if (!donor) {
      skipped++
      continue
    }
    const donorEmail = donor.email?.trim() ?? ""
    if (!donorEmail || !EMAIL_RE.test(donorEmail)) {
      skipped++
      continue
    }
    const donorName = donor.name ?? ""

    const personalizedMessage = message
      .replace(/\{\{donor_name\}\}/g, donorName)
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    const personalizedSubject = subject
      .replace(/\{\{donor_name\}\}/g, donorName)
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
    const html = `<p>${personalizedMessage
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")}</p>`

    // Atomic per-send quota reservation. This is the real enforcement point
    // (the batch pre-check above is advisory): two concurrent batches can't
    // both slip under the hourly cap because each send reserves its own slot.
    const { data: allowed, error: quotaErr } = await supabase.rpc(
      "try_consume_email_quota",
      {
        p_user_id: auth.userId,
        p_org_id: auth.orgId,
        p_limit: HOURLY_LIMIT,
        p_window: "01:00:00",
      }
    )
    if (quotaErr || !allowed) {
      failed.push({
        donorId: recipient.donorId,
        donorEmail,
        error: "Hourly email rate limit reached",
      })
      continue
    }

    try {
      await sendGmailMessage({
        userId: auth.userId,
        orgId: auth.orgId,
        to: donorEmail,
        subject: personalizedSubject.trim(),
        html,
      })

      await supabase.from("interactions").insert({
        donor_id: recipient.donorId,
        type: "email",
        direction: "outbound",
        subject: personalizedSubject.trim(),
        content: personalizedMessage.trim(),
        date: new Date().toISOString(),
      })

      sent++
    } catch (err) {
      // If Gmail isn't connected at all, no point continuing the batch.
      if (err instanceof GmailNotConnectedError) {
        return NextResponse.json(
          {
            error: "Connect Gmail to send email as your ministry.",
            code: "gmail_not_connected",
          },
          { status: 412 }
        )
      }
      if (err instanceof GmailNeedsReauthError) {
        return NextResponse.json(
          {
            error: "Gmail access expired. Please reconnect.",
            code: "gmail_needs_reauth",
          },
          { status: 412 }
        )
      }
      const errMsg = err instanceof Error ? err.message : "Unknown error"
      console.error(
        `[email/bulk-send] Failed for donor ${recipient.donorId}:`,
        errMsg
      )
      failed.push({
        donorId: recipient.donorId,
        donorEmail,
        error: errMsg.slice(0, 200),
      })
    }
  }

  return NextResponse.json({ sent, failed, skipped })
}
