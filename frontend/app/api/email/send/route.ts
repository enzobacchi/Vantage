import { NextResponse } from "next/server"
import { Resend } from "resend"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

const FROM_EMAIL = "Vantage <onboarding@resend.dev>"

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
    .eq("org_id", auth.orgId)
    .gte("sent_at", oneHourAgo)

  if (rateLimitError) {
    return NextResponse.json(
      { error: "Could not check email rate limit", code: "RATE_LIMIT_CHECK_FAILED" },
      { status: 500 }
    )
  }
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      {
        error: "Email rate limit exceeded. Your organization can send up to 10 emails per hour. Please try again later.",
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

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email sending is not configured (RESEND_API_KEY)" },
      { status: 503 }
    )
  }

  const resend = new Resend(apiKey)
  const { data: sendData, error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: donorEmail.trim(),
    subject: subject.trim(),
    html: `<p>${message.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`,
  })

  if (sendError) {
    return NextResponse.json(
      { error: "Failed to send email", details: sendError.message },
      { status: 502 }
    )
  }

  const { error: logError } = await supabase.from("email_send_log").insert({
    org_id: auth.orgId,
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
    return NextResponse.json(
      { error: "Email sent but failed to log to timeline", details: insertError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id: sendData?.id })
}
