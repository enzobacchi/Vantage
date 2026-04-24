import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { getUsage } from "@/lib/subscription"

/**
 * GET /api/chat/usage
 * Returns the org's current-month chat usage for the overlay header.
 * `limit === 0` means unlimited on this plan.
 */
export async function GET() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const usage = await getUsage(auth.orgId, "chat_messages")
  return NextResponse.json(usage)
}
