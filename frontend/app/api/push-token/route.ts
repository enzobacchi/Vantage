import { NextRequest, NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

const VALID_PLATFORMS = ["ios", "android"] as const

/**
 * POST /api/push-token
 *
 * Stores the mobile app's Expo push token for the authenticated user
 * (Mobile/lib/notifications.ts). Tokens are unique — re-registering moves the
 * token to the current user/org, which covers device handoffs and re-logins.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    token?: string
    platform?: string
  }

  const token = typeof body.token === "string" ? body.token.trim() : ""
  const platform = body.platform as (typeof VALID_PLATFORMS)[number]

  if (!token || token.length > 200) {
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 })
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Invalid platform. Must be ios or android" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("push_tokens").upsert(
    {
      token,
      user_id: auth.userId,
      org_id: auth.orgId,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  )

  if (error) {
    console.error("[push-token] upsert failed:", error.message)
    return NextResponse.json({ error: "Could not register push token" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
