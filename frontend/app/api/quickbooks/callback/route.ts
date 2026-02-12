import { appendFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createQBOAuthClient } from "@/lib/quickbooks/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function debugLog(payload: Record<string, unknown>) {
  const line = JSON.stringify({ ...payload, timestamp: Date.now(), sessionId: "debug-session" });
  console.log("[QB callback debug]", line);
  try {
    const logPath = join(process.cwd(), "debug_callback.log");
    appendFileSync(logPath, line + "\n");
  } catch (_) {}
}

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
  // #region agent log
  debugLog({ location: "qb_callback:handler_entered", message: "GET handler entered", hypothesisId: "H0" });
  // #endregion
  const url = new URL(request.url);
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("qb_oauth_state")?.value;

  // #region agent log
  debugLog({
    location: "quickbooks/callback/route.ts:entry",
    message: "QB callback GET entry",
    data: {
      hasRealmId: !!realmId,
      hasState: !!state,
      hasExpectedState: !!expectedState,
      stateMatch: state === expectedState,
      requestUrlHost: url.host,
      requestUrlProtocol: url.protocol,
      fullRequestUrl: request.url?.slice(0, 120) ?? null,
    },
    hypothesisId: "H1",
  });
  fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "quickbooks/callback/route.ts:entry",
      message: "QB callback GET entry",
      data: {
        hasRealmId: !!realmId,
        hasState: !!state,
        hasExpectedState: !!expectedState,
        stateMatch: state === expectedState,
        requestUrlHost: url.host,
        requestUrlProtocol: url.protocol,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      hypothesisId: "H1",
    }),
  }).catch(() => {});
  // #endregion

  if (!realmId) {
    return NextResponse.json(
      { error: "Missing realmId from QuickBooks callback." },
      { status: 400 }
    );
  }

  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid QuickBooks OAuth state." }, { status: 400 });
  }

  let oauthClient;
  try {
    oauthClient = createQBOAuthClient();
  } catch (e) {
    // #region agent log
    debugLog({
      location: "quickbooks/callback/route.ts:createClientThrow",
      message: "createQBOAuthClient threw",
      data: { message: e instanceof Error ? e.message : String(e) },
      hypothesisId: "H2",
    });
    fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "quickbooks/callback/route.ts:createClientThrow",
        message: "createQBOAuthClient threw",
        data: { message: e instanceof Error ? e.message : String(e) },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "H2",
      }),
    }).catch(() => {});
    // #endregion
    throw e;
  }

  try {
    // #region agent log
    debugLog({
      location: "quickbooks/callback/route.ts:beforeCreateToken",
      message: "before createToken",
      data: { requestUrlLength: request.url?.length ?? 0, requestUrlStartsWith: (request.url ?? "").slice(0, 80) },
      hypothesisId: "H3",
    });
    fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "quickbooks/callback/route.ts:beforeCreateToken",
        message: "before createToken",
        data: { requestUrlLength: request.url?.length ?? 0, requestUrlStartsWith: (request.url ?? "").slice(0, 50) },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "H3",
      }),
    }).catch(() => {});
    // #endregion
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

    // Audit: save refresh_token into qb_refresh_token (not access_token).
    console.log("Saving Refresh Token Length:", refreshToken?.length ?? 0);
    console.log("Saving Access Token Length:", accessToken?.length ?? 0);

    const admin = createAdminClient();
    const { data: orgRow, error } = await admin
      .from("organizations")
      .upsert(
        {
          name: "Default Organization",
          qb_realm_id: realmId,
          qb_access_token: accessToken,
          qb_refresh_token: refreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "qb_realm_id" }
      )
      .select("id")
      .single();

    if (error) {
      // #region agent log
      debugLog({
        location: "quickbooks/callback/route.ts:upsertError",
        message: "Supabase org upsert failed",
        data: { errorMessage: error.message },
        hypothesisId: "H4",
      });
      fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "quickbooks/callback/route.ts:upsertError",
          message: "Supabase org upsert failed",
          data: { errorMessage: error.message },
          timestamp: Date.now(),
          sessionId: "debug-session",
          hypothesisId: "H4",
        }),
      }).catch(() => {});
      // #endregion
      return NextResponse.json(
        { error: "Failed to save tokens to Supabase.", details: error.message },
        { status: 500 }
      );
    }

    // Link current user to this org, or store org for later if they're not logged in (Sign in with QuickBooks flow)
    const serverSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (user?.id && orgRow?.id) {
      await admin
        .from("organization_members")
        .upsert(
          { user_id: user.id, organization_id: orgRow.id, role: "member" },
          { onConflict: "user_id,organization_id" }
        );
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
            const u = new URL("/dashboard", origin);
            u.searchParams.set("view", "settings");
            u.searchParams.set("qb", "connected");
            u.searchParams.set("realmId", realmId);
            return u;
          })()
        : new URL("/login?qb=1", origin);
    // #region agent log
    debugLog({
      location: "quickbooks/callback/route.ts:beforeRedirect",
      message: "about to redirect",
      data: { redirectUrl: redirectTo.toString(), hasUser: !!user?.id },
      hypothesisId: "H5",
    });
    fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "quickbooks/callback/route.ts:beforeRedirect",
        message: "about to redirect",
        data: { redirectUrl: redirectTo.toString(), hasUser: !!user?.id },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "H5",
      }),
    }).catch(() => {});
    // #endregion
    const res = NextResponse.redirect(redirectTo);

    res.cookies.delete("qb_oauth_state");
    if (!user?.id && orgRow?.id) {
      res.cookies.set("qb_pending_org_id", orgRow.id, {
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
    const stack = e instanceof Error ? e.stack : undefined;
    // #region agent log
    debugLog({
      location: "quickbooks/callback/route.ts:catch",
      message: "QB callback catch",
      data: { message, stack: (stack ?? "").slice(0, 500) },
      hypothesisId: "H3",
    });
    fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "quickbooks/callback/route.ts:catch",
        message: "QB callback catch",
        data: { message, stack: (stack ?? "").slice(0, 500) },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "H3",
      }),
    }).catch(() => {});
    // #endregion
    const res = NextResponse.json(
      { error: "QuickBooks callback failed.", details: message },
      { status: 400 }
    );
    res.cookies.delete("qb_oauth_state");
    return res;
  }
}

