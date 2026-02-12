import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Returns QuickBooks connection status for the current user's organization.
 */
export async function GET() {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const { data: org, error } = await supabase
      .from("organizations")
      .select("qb_realm_id,qb_refresh_token")
      .eq("id", auth.orgId)
      .maybeSingle();

    if (error) {
      const details = error.message;
      const looksLikeMissingTables =
        typeof details === "string" &&
        details.includes("schema cache") &&
        details.includes("Could not find the table");

      return NextResponse.json(
        {
          connected: false,
          error: looksLikeMissingTables
            ? "Supabase tables are missing."
            : "Failed to load connection status.",
          details,
        },
        { status: looksLikeMissingTables ? 500 : 502 }
      );
    }

    const connected = !!(org?.qb_realm_id && org?.qb_refresh_token);
    return NextResponse.json({
      connected,
      realmId: org?.qb_realm_id ?? undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { connected: false, error: message },
      { status: 500 }
    );
  }
}
