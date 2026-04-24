import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { isSyncError, runSyncForOrg } from "@/lib/sync/run-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const full = url.searchParams.get("full") === "true";

  const result = await runSyncForOrg(auth.orgId, { full });

  if (isSyncError(result)) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status }
    );
  }

  return NextResponse.json(result);
}
