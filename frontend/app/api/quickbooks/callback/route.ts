import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  createQBOAuthClient,
  getQBRedirectUriFromRequest,
} from "@/lib/quickbooks/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    return NextResponse.json({ error: "Invalid QuickBooks OAuth state." }, { status: 400 });
  }

  try {
    const redirectUri = getQBRedirectUriFromRequest(request);
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
      return NextResponse.json(
        { error: "Failed to save tokens to Supabase.", details: error.message },
        { status: 500 }
      );
    }

    // Link current user to this org (do not overwrite existing role — team/ownership only via Settings)
    const serverSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (user?.id && orgRow?.id) {
      const { data: existing } = await admin
        .from("organization_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", orgRow.id)
        .maybeSingle();
      if (!existing) {
        await admin.from("organization_members").insert({
          user_id: user.id,
          organization_id: orgRow.id,
          role: "member",
        });
      }
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
    console.error("QuickBooks callback error:", message);
    const res = NextResponse.json(
      { error: "QuickBooks callback failed.", details: message },
      { status: 400 }
    );
    res.cookies.delete("qb_oauth_state");
    return res;
  }
}

