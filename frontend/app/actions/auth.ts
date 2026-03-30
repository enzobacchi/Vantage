"use server"

import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { passwordResetEmailHtml } from "@/lib/email-templates"

const FROM_EMAIL = "Vantage <notifications@vantagedonorai.com>"

export async function sendPasswordResetEmail(
  email: string
): Promise<{ error?: string }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return { error: "Email is required." }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { error: "Email is not configured." }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: trimmed,
    options: { redirectTo },
  })

  if (error || !data?.properties?.action_link) {
    // Don't leak whether the account exists — always show success
    return {}
  }

  const resetLink = data.properties.action_link
  const resend = new Resend(apiKey)
  const { error: sendError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: trimmed,
    subject: "Reset your Vantage password",
    html: passwordResetEmailHtml(resetLink),
  })

  if (sendError) {
    console.error("[auth] Failed to send password reset email:", sendError)
    return { error: "Failed to send email. Please try again." }
  }

  return {}
}
