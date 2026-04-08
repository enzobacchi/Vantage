import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id,name,color,created_at")
    .eq("organization_id", auth.orgId)
    .order("name");

  if (error) {
    console.error("[tags] GET:", error.message);
    return NextResponse.json({ error: "Failed to load tags." }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
