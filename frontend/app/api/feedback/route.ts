import path from "node:path"
import { config } from "dotenv"
import { NextResponse } from "next/server"
import { Resend } from "resend"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

const FROM_EMAIL = "Vantage <onboarding@resend.dev>"

/** Explicitly load .env.local if FEEDBACK_EMAIL_TO or RESEND_API_KEY are missing (Next.js/Turbopack may not load them) */
function ensureFeedbackEnv(): void {
  if (process.env.FEEDBACK_EMAIL_TO && process.env.RESEND_API_KEY) return
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "frontend", ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local"),
  ]
  for (const envPath of candidates) {
    config({ path: envPath, override: true, quiet: true })
    if (process.env.FEEDBACK_EMAIL_TO && process.env.RESEND_API_KEY) break
  }
}
const FEEDBACK_TYPES = ["bug", "feature_request", "general"] as const

export async function POST(request: Request) {
  const auth = await requireUserOrg()
  if (!auth.ok) {
    return auth.response
  }

  let body: { type?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { type, message } = body
  const trimmed = typeof message === "string" ? message.trim() : ""
  if (trimmed.length < 10) {
    return NextResponse.json(
      { error: "Message must be at least 10 characters" },
      { status: 400 }
    )
  }
  if (!type || !FEEDBACK_TYPES.includes(type as (typeof FEEDBACK_TYPES)[number])) {
    return NextResponse.json(
      { error: "Invalid feedback type. Use bug, feature_request, or general" },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from("user_feedback").insert({
    organization_id: auth.orgId,
    user_id: auth.userId,
    feedback_type: type,
    message: trimmed,
  })

  if (error) {
    return NextResponse.json(
      { error: "Failed to save feedback", details: error.message },
      { status: 500 }
    )
  }

  // Send email notification if configured
  ensureFeedbackEnv()
  const toEmail = process.env.FEEDBACK_EMAIL_TO?.trim()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!toEmail || !apiKey) {
    console.log("[api/feedback] Email skipped: FEEDBACK_EMAIL_TO or RESEND_API_KEY missing (cwd:", process.cwd(), ")")
  }
  if (toEmail && apiKey) {
    const typeLabel =
      type === "bug" ? "Bug" : type === "feature_request" ? "Feature Request" : "General"
    const escapedMessage = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")
    const resend = new Resend(apiKey)
    const { error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: `[Vantage Feedback] ${typeLabel}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; line-height: 1.5;">
          <h2 style="margin-bottom: 1rem;">New Feedback: ${typeLabel}</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
            <tr>
              <td style="padding: 0.5rem 0; font-weight: 600; color: #64748b;">Feedback Type</td>
              <td style="padding: 0.5rem 0;">${typeLabel}</td>
            </tr>
          </table>
          <p style="font-weight: 600; color: #64748b; margin-bottom: 0.5rem;">Message</p>
          <p style="margin: 0; padding: 1rem; background: #f8fafc; border-radius: 6px; white-space: pre-wrap;">${escapedMessage}</p>
        </div>
      `.trim(),
    })
    if (sendError) {
      console.error("[api/feedback] Resend failed:", sendError.message)
    } else {
      console.log("[api/feedback] Email sent to", toEmail)
    }
  }

  return NextResponse.json({ ok: true })
}
