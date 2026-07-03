import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  createQBOAuthClient,
  getQBRedirectUriFromRequest,
} from "@/lib/quickbooks/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { encryptQbToken } from "@/lib/quickbooks/token-crypto";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

function isLocalhostHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h.startsWith("127.0.0.1:") ||
    h === "[::1]" ||
    h.startsWith("[::1]:")
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("qb_oauth_state")?.value;

  if (!realmId) {
    return NextResponse.json(
      { error: "Missing realmId from QuickBooks callback." },
      { status: 400 }
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    console.error(
      "[QB callback] State mismatch — state:", state ? "present" : "MISSING",
      "| expectedState (cookie):", expectedState ? "present" : "MISSING"
    );

    // Redirect to a user-friendly page instead of showing raw JSON
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ?? request.headers.get("host") ?? url.host;
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const proto = isLocalhostHost(host) ? "http" : (forwardedProto ?? "https");
    const loginUrl = new URL("/login", `${proto}://${host}`);
    loginUrl.searchParams.set("error", "qb_state");
    return NextResponse.redirect(loginUrl.toString());
  }

  try {
    const redirectUri = getQBRedirectUriFromRequest(request);
    console.log("[QB callback] redirectUri:", redirectUri);
    const oauthClient = createQBOAuthClient(redirectUri);
    const authResponse = await oauthClient.createToken(request.url);
    const tokenJson = authResponse.getJson();

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: "QuickBooks token exchange succeeded but tokens missing." },
        { status: 500 }
      );
    }

    // Tokens are encrypted at rest; decryption happens in the sync/writeback
    // paths via decryptQbToken (with plaintext fallback for legacy rows).
    const storedAccessToken = encryptQbToken(accessToken);
    const storedRefreshToken = encryptQbToken(refreshToken);

    const admin = createAdminClient();
    const serverSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    let orgId: string | null = null;

    if (user?.id) {
      // Authenticated user: update their EXISTING org with QB tokens
      // instead of creating a second org via upsert-on-realm-id.
      const { data: membership } = await admin
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membership?.organization_id) {
        // Realm-takeover guard (P2-D): if this QB company is already linked
        // to a different Vantage org, moving it silently would cut off that
        // org's sync. Require an explicit owner-confirmed reconnect.
        const { data: existingQbOrg } = await admin
          .from("organizations")
          .select("id, name")
          .eq("qb_realm_id", realmId)
          .neq("id", membership.organization_id)
          .maybeSingle();

        if (existingQbOrg) {
          const confirmedMove =
            cookieStore.get("qb_confirm_realm_move")?.value === "1";
          const isOwner = membership.role === "owner";

          if (!confirmedMove || !isOwner) {
            const forwardedHost = request.headers.get("x-forwarded-host");
            const host = forwardedHost ?? request.headers.get("host") ?? url.host;
            const forwardedProto = request.headers.get("x-forwarded-proto");
            const proto = isLocalhostHost(host) ? "http" : (forwardedProto ?? "https");
            const conflictUrl = new URL("/settings", `${proto}://${host}`);
            conflictUrl.searchParams.set("tab", "integrations");
            conflictUrl.searchParams.set(
              "qb",
              !isOwner && confirmedMove ? "realm_conflict_owner_only" : "realm_conflict"
            );
            const conflictRes = NextResponse.redirect(conflictUrl.toString());
            conflictRes.cookies.delete("qb_oauth_state");
            conflictRes.cookies.delete("qb_confirm_realm_move");
            return conflictRes;
          }

          // Owner-confirmed move: release the realm from the other org,
          // flag it for reconnect so its members see why sync stopped,
          // and leave an audit trail in the acquiring org.
          await admin
            .from("organizations")
            .update({
              qb_realm_id: null,
              qb_access_token: null,
              qb_refresh_token: null,
              qb_needs_reconnect: true,
              qb_last_sync_error:
                "This QuickBooks company was reconnected to a different Vantage organization.",
            })
            .eq("id", existingQbOrg.id);

          await logAuditEvent({
            orgId: membership.organization_id,
            userId: user.id,
            action: "quickbooks.realm_moved",
            entityType: "organization",
            entityId: existingQbOrg.id,
            summary: `QuickBooks company (realm ${realmId}) moved from another organization after owner confirmation`,
            details: { realm_id: realmId, previous_org_id: existingQbOrg.id },
          });
        }

        const { error: updateError } = await admin
          .from("organizations")
          .update({
            qb_realm_id: realmId,
            qb_access_token: storedAccessToken,
            qb_refresh_token: storedRefreshToken,
            updated_at: new Date().toISOString(),
          })
          .eq("id", membership.organization_id);

        if (updateError) {
          console.error("[QB callback] Failed to update org with tokens:", updateError.message);
          return NextResponse.json(
            { error: "Failed to save tokens to Supabase." },
            { status: 500 }
          );
        }

        orgId = membership.organization_id;
      } else {
        // User has no org yet (rare) — create one
        const { data: newOrg, error: createError } = await admin
          .from("organizations")
          .insert({
            name: "Default Organization",
            qb_realm_id: realmId,
            qb_access_token: storedAccessToken,
            qb_refresh_token: storedRefreshToken,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (createError || !newOrg?.id) {
          console.error("[QB callback] Failed to create org:", createError?.message);
          return NextResponse.json(
            { error: "Failed to save tokens to Supabase." },
            { status: 500 }
          );
        }

        orgId = newOrg.id;

        await admin.from("organization_members").insert({
          user_id: user.id,
          organization_id: orgId,
          role: "owner",
        });
      }
    } else {
      // Not authenticated: upsert org by realm ID (pending org cookie flow)
      const { data: orgRow, error } = await admin
        .from("organizations")
        .upsert(
          {
            name: "Default Organization",
            qb_realm_id: realmId,
            qb_access_token: storedAccessToken,
            qb_refresh_token: storedRefreshToken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "qb_realm_id" }
        )
        .select("id")
        .single();

      if (error) {
        console.error("[QB callback] Failed to save tokens:", error.message);
        return NextResponse.json(
          { error: "Failed to save tokens to Supabase." },
          { status: 500 }
        );
      }

      orgId = orgRow?.id ?? null;
    }

    // Build a safe redirect origin:
    // - NEVER redirect to https://localhost
    // - Respect ngrok/vercel https when applicable
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ?? request.headers.get("host") ?? url.host;
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const protoFromUrl = url.protocol.replace(":", "");
    const proto = isLocalhostHost(host)
      ? "http"
      : forwardedProto ?? (protoFromUrl || "https");

    const origin = `${proto}://${host}`;
    const redirectTo =
      user?.id
        ? (() => {
            const u = new URL("/settings", origin);
            u.searchParams.set("tab", "integrations");
            u.searchParams.set("qb", "connected");
            u.searchParams.set("realmId", realmId);
            return u;
          })()
        : new URL("/login?qb=1", origin);
    const res = NextResponse.redirect(redirectTo);

    res.cookies.delete("qb_oauth_state");
    res.cookies.delete("qb_confirm_realm_move");
    if (!user?.id && orgId) {
      // Encrypt (AES-256-GCM) so the cookie can't be forged: only the browser
      // that actually completed this QB OAuth holds a valid token. link-pending-org
      // rejects anything that doesn't decrypt.
      res.cookies.set("qb_pending_org_id", encrypt(orgId), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 15, // 15 minutes to sign in and claim the org
      });
    }
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[QB callback] error:", message);

    // Try to redirect to settings with error info instead of raw JSON
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ?? request.headers.get("host");
    if (host) {
      const forwardedProto = request.headers.get("x-forwarded-proto");
      const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
      const proto = isLocal ? "http" : (forwardedProto ?? "https");
      const settingsUrl = new URL("/settings", `${proto}://${host}`);
      settingsUrl.searchParams.set("tab", "integrations");
      settingsUrl.searchParams.set("qb_error", message.slice(0, 200));
      const res = NextResponse.redirect(settingsUrl.toString());
      res.cookies.delete("qb_oauth_state");
      return res;
    }

    const res = NextResponse.json(
      { error: "QuickBooks callback failed.", details: message },
      { status: 400 }
    );
    res.cookies.delete("qb_oauth_state");
    return res;
  }
}

