import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

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

    // Paged: with one 1,000-row request, states late in the alphabet vanish.
    const data = await fetchAllRows<{ state: string | null }>((from, to) =>
      supabase
        .from("donors")
        .select("state")
        .eq("org_id", orgId)
        .not("state", "is", null)
        .order("state", { ascending: true })
        .order("id")
        .range(from, to)
    );

    const states = Array.from(
      new Set(data.map((r) => r.state as string).filter(Boolean))
    ).sort();

    return NextResponse.json(states);
  } catch {
    return NextResponse.json(
      { error: "Failed to load states." },
      { status: 500 }
    );
  }
}
