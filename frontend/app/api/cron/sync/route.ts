import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSyncError, runSyncForOrg, type SyncResult, type SyncError } from "@/lib/sync/run-sync";
import { notifySystemAlert } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — cron may sync multiple orgs

/**
 * Cron-triggered sync for all QB-connected orgs.
 * Secured via CRON_SECRET (Vercel automatically sends this header for cron jobs).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find all orgs with an active QB connection
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, qb_realm_id")
    .not("qb_realm_id", "is", null)
    .not("qb_refresh_token", "is", null);

  if (orgsError) {
    return NextResponse.json(
      { error: "Failed to list organizations." },
      { status: 500 }
    );
  }

  if (!orgs?.length) {
    return NextResponse.json({ message: "No QB-connected orgs to sync.", results: [] });
  }

  // Sync each org independently — one failure doesn't block others
  const results: Array<{
    orgId: string;
    realmId: string | null;
    success: boolean;
    result: SyncResult | SyncError;
  }> = [];

  for (const org of orgs) {
    try {
      const result = await runSyncForOrg(org.id);
      const success = !isSyncError(result);
      results.push({
        orgId: org.id,
        realmId: org.qb_realm_id,
        success,
        result,
      });
      if (!success && isSyncError(result)) {
        void notifySystemAlert(org.id, "QuickBooks sync failed", `Sync returned an error: ${result.error}. You may need to reconnect QuickBooks.`).catch(console.error);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error(`[Cron Sync] Failed for org ${org.id}:`, message);
      results.push({
        orgId: org.id,
        realmId: org.qb_realm_id,
        success: false,
        result: { error: message, status: 500 },
      });
      void notifySystemAlert(org.id, "QuickBooks sync failed", `Automatic sync failed: ${message}. Check your QuickBooks connection in Settings.`).catch(console.error);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[Cron Sync] Complete: ${succeeded} succeeded, ${failed} failed out of ${results.length} orgs`);

  return NextResponse.json({
    totalOrgs: results.length,
    succeeded,
    failed,
    results,
  });
}
