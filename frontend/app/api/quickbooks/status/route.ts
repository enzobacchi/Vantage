import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { canManageQuickBooks } from "@/lib/quickbooks/connect-permission";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Returns QuickBooks connection status for the current user's organization,
 * plus `canManage` — whether this user may connect/reconnect QuickBooks
 * (owners and admins only; enforced server-side in the OAuth routes).
 */
export async function GET() {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const [{ data: org, error }, { data: member, error: memberError }] = await Promise.all([
      supabase
        .from("organizations")
        .select("qb_realm_id,qb_refresh_token,qb_needs_reconnect,qb_last_sync_error,last_synced_at")
        .eq("id", auth.orgId)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", auth.orgId)
        .eq("user_id", auth.userId)
        .maybeSingle(),
    ]);

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
    // A connection can be present (tokens stored) yet broken (Intuit revoked the
    // grant). Surface that so the UI prompts a reconnect instead of showing a
    // green "Connected".
    const needsReconnect = connected && !!org?.qb_needs_reconnect;
    return NextResponse.json({
      connected,
      needsReconnect,
      lastSyncError: needsReconnect ? org?.qb_last_sync_error ?? null : null,
      lastSyncedAt: org?.last_synced_at ?? null,
      realmId: org?.qb_realm_id ?? undefined,
      // On a role-lookup error, don't hide the control from an owner: the
      // OAuth routes enforce the role server-side regardless.
      canManage: memberError ? true : canManageQuickBooks(member?.role),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { connected: false, error: message },
      { status: 500 }
    );
  }
}
