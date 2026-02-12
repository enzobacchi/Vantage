import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * DEBUG ONLY: Deletes all rows from the organizations table.
 * Use to clear stale/duplicate orgs that cause "Invalid Token" or sync loops.
 * Do not expose this route in production without protection.
 */
export async function POST() {
  try {
    const supabase = createAdminClient();

    await supabase
      .from("organizations")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    return NextResponse.json({
      message: "Database Flushed. All organizations deleted.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Flush failed.", details: message },
      { status: 500 }
    );
  }
}
