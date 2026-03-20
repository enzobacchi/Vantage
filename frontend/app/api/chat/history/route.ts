import { NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("chat_history")
    .select("id,role,content,tool_invocations,created_at")
    .eq("org_id", auth.orgId)
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json(
      { error: "Failed to load chat history.", details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ messages: data ?? [] })
}

export async function DELETE() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const supabase = createAdminClient()

  const { error } = await supabase
    .from("chat_history")
    .delete()
    .eq("org_id", auth.orgId)
    .eq("user_id", auth.userId)

  if (error) {
    return NextResponse.json(
      { error: "Failed to clear chat history.", details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
