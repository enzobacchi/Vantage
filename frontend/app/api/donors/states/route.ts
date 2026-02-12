import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Returns distinct state values from donors (for filter dropdown).
 * Scoped to current user's organization.
 */
export async function GET() {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const orgId = auth.orgId;

    const { data, error } = await supabase
      .from("donors")
      .select("state")
      .eq("org_id", orgId)
      .not("state", "is", null)
      .order("state", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load states.", details: error.message },
        { status: 500 }
      );
    }

    const states = Array.from(
      new Set((data ?? []).map((r) => r.state as string).filter(Boolean))
    ).sort();

    return NextResponse.json(states);
  } catch {
    return NextResponse.json(
      { error: "Failed to load states." },
      { status: 500 }
    );
  }
}
