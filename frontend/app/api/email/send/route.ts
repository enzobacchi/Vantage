import { NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  GmailNeedsReauthError,
  GmailNotConnectedError,
  GmailSendError,
  sendGmailMessage,
} from "@/lib/gmail/send"

export const runtime = "nodejs"

const HOURLY_LIMIT = 50

export async function POST(request: Request) {
  const auth = await requireUserOrg()
  if (!auth.ok) {
    return auth.response
  }

  let body: { donorEmail: string; subject: string; message: string; donorId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const { donorEmail, subject, message, donorId } = body
  if (!donorEmail || typeof donorEmail !== "string" || !donorEmail.trim()) {
    return NextResponse.json(
      { error: "donorEmail is required" },
      { status: 400 }
    )
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(donorEmail.trim())) {
    return NextResponse.json(
      { error: "Invalid email address format" },
      { status: 400 }
    )
  }
  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return NextResponse.json(
      { error: "subject is required" },
      { status: 400 }
    )
  }
  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    )
  }
  if (!donorId || typeof donorId !== "string") {
    return NextResponse.json(
      { error: "donorId is required" },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: rateLimitError } = await supabase
    .from("email_send_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .gte("sent_at", oneHourAgo)

  if (rateLimitError) {
    return NextResponse.json(
      { error: "Could not check email rate limit", code: "RATE_LIMIT_CHECK_FAILED" },
      { status: 500 }
    )
  }
  if ((count ?? 0) >= HOURLY_LIMIT) {
    return NextResponse.json(
      {
        error: `Email rate limit exceeded. You can send up to ${HOURLY_LIMIT} emails per hour. Please try again later.`,
        code: "RATE_LIMIT_EXCEEDED",
      },
      { status: 429 }
    )
  }

  const { data: donor, error: donorError } = await supabase
    .from("donors")
    .select("id")
    .eq("id", donorId)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (donorError || !donor) {
    return NextResponse.json(
      { error: "Donor not found or access denied" },
      { status: 404 }
    )
  }

  const html = `<p>${message
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")}</p>`

  let sendResult
  try {
    sendResult = await sendGmailMessage({
      userId: auth.userId,
      orgId: auth.orgId,
      to: donorEmail.trim(),
      subject: subject.trim(),
      html,
    })
  } catch (err) {
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
    if (err instanceof GmailSendError) {
      console.error("[email/send] Gmail API error:", err.status, err.body)
      return NextResponse.json(
        { error: "Failed to send email via Gmail. Please try again." },
        { status: 502 }
      )
    }
    const msg = err instanceof Error ? err.message : "Unknown send error"
    console.error("[email/send] Unexpected error:", msg)
    return NextResponse.json(
      { error: "Failed to send email." },
      { status: 500 }
    )
  }

  const { error: logError } = await supabase.from("email_send_log").insert({
    org_id: auth.orgId,
    user_id: auth.userId,
    sent_at: new Date().toISOString(),
  })
  if (logError) {
    console.warn("[email/send] Failed to log send for rate limit", logError.message)
  }

  const { error: insertError } = await supabase.from("interactions").insert({
    donor_id: donorId,
    type: "email",
    direction: "outbound",
    subject: subject.trim(),
    content: message.trim(),
    date: new Date().toISOString(),
  })

  if (insertError) {
    console.error("[email/send] Failed to log interaction:", insertError.message)
    return NextResponse.json(
      { error: "Email sent but failed to log to timeline." },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    id: sendResult.messageId,
    fromEmail: sendResult.fromEmail,
  })
}
