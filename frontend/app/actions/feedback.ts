"use server"

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireUserOrg } from "@/lib/auth"

const FROM_EMAIL = "Vantage <onboarding@resend.dev>"

/**
 * Submit feedback via server action. For reliable email delivery, prefer using
 * POST /api/feedback from the UI (API routes get env vars at startup).
 */
export type FeedbackType = "bug" | "feature_request" | "general"

export type SubmitFeedbackInput = {
  type: FeedbackType
  message: string
}

export type SubmitFeedbackResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Submit user feedback (bug, feature request, or general).
 * Requires authenticated user and org. Automatically captures userId and orgId.
 */
export async function submitFeedback(data: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  const auth = await requireUserOrg()
  if (!auth.ok) {
    return { ok: false, error: "You must be signed in to submit feedback." }
  }

  const trimmed = (data.message ?? "").trim()
  if (trimmed.length < 10) {
    return { ok: false, error: "Message must be at least 10 characters." }
  }

  const allowed: FeedbackType[] = ["bug", "feature_request", "general"]
  if (!allowed.includes(data.type as FeedbackType)) {
    return { ok: false, error: "Invalid feedback type." }
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from("user_feedback").insert({
    organization_id: auth.orgId,
    user_id: auth.userId,
    feedback_type: data.type,
    message: trimmed,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  // Send feedback email notification if configured (server actions may not have env; use /api/feedback for UI)
  const toEmail = process.env.FEEDBACK_EMAIL_TO?.trim()
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (toEmail && apiKey) {
    const typeLabel =
      data.type === "bug"
        ? "Bug"
        : data.type === "feature_request"
          ? "Feature Request"
          : "General"
    const escapedMessage = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")
    const resend = new Resend(apiKey)
    const { data: sendData, error: sendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail.trim(),
      subject: `[Vantage Feedback] ${typeLabel}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; line-height: 1.5;">
          <h2 style="margin-bottom: 1rem;">New Feedback: ${typeLabel}</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
            <tr>
              <td style="padding: 0.5rem 0; font-weight: 600; color: #64748b;">User ID</td>
              <td style="padding: 0.5rem 0;"><code style="background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px;">${auth.userId}</code></td>
            </tr>
            <tr>
              <td style="padding: 0.5rem 0; font-weight: 600; color: #64748b;">Organization ID</td>
              <td style="padding: 0.5rem 0;"><code style="background: #f1f5f9; padding: 0.25rem 0.5rem; border-radius: 4px;">${auth.orgId}</code></td>
            </tr>
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
      console.error("[submitFeedback] Resend failed:", sendError.message)
    }
  }

  return { ok: true }
}
