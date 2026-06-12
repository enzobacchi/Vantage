import { NextResponse } from "next/server"
import { Resend } from "resend"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildExport, EXPORT_TYPES } from "@/lib/export-builders"

/**
 * POST /api/account/export
 *
 * Emails the caller their org's full CSV export (donors, donations,
 * interactions) as attachments. Used by mobile (Settings → Profile →
 * Export my data), where a streaming CSV download is impractical.
 */
export async function POST() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const rl = checkRateLimit(`account-export:${auth.userId}`, 3, 60 * 60 * 1000)
  if (rl.limited) {
    return NextResponse.json(
      { error: "Export limit reached. Try again in an hour." },
      { status: 429 }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Export email is not configured. Please contact support." },
      { status: 503 }
    )
  }

  const admin = createAdminClient()
  const { data: userData } = await admin.auth.admin.getUserById(auth.userId)
  const email = userData?.user?.email
  if (!email) {
    return NextResponse.json({ error: "No email on file for this account" }, { status: 400 })
  }

  try {
    const exports = await Promise.all(
      EXPORT_TYPES.map((type) => buildExport(admin, auth.orgId, type))
    )

    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: "Vantage <notifications@vantagedonorai.com>",
      to: email,
      subject: "Your Vantage data export",
      html: `<p>Attached is a full export of your organization's data: donors, donations, and interactions (CSV).</p><p>If you didn't request this export, please contact support@vantagedonorai.com.</p>`,
      attachments: exports.map((e) => ({
        filename: e.filename,
        content: Buffer.from(e.csv, "utf-8").toString("base64"),
      })),
    })

    if (error) {
      console.error("[account/export] send failed:", error.message)
      return NextResponse.json({ error: "Could not send the export email" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[account/export] failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Export failed. Please try again later." }, { status: 500 })
  }
}
