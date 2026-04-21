import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import {
  exchangeCodeForTokens,
  fetchUserEmail,
  getGoogleOAuthConfig,
  GMAIL_SCOPES,
} from "@/lib/gmail/oauth";

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

function buildSettingsUrl(
  request: Request,
  params: Record<string, string>
): URL {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = isLocalhostHost(host) ? "http" : forwardedProto ?? "https";
  const target = new URL("/settings", `${proto}://${host}`);
  target.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }
  return target;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;

  if (error) {
    const res = NextResponse.redirect(
      buildSettingsUrl(request, { gmail_error: error.slice(0, 200) }).toString()
    );
    res.cookies.delete("gmail_oauth_state");
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(
      buildSettingsUrl(request, { gmail_error: "missing_code" }).toString()
    );
    res.cookies.delete("gmail_oauth_state");
    return res;
  }

  if (!state || !expectedState || state !== expectedState) {
    console.error("[Gmail callback] State mismatch.");
    const res = NextResponse.redirect(
      buildSettingsUrl(request, { gmail_error: "state_mismatch" }).toString()
    );
    res.cookies.delete("gmail_oauth_state");
    return res;
  }

  const auth = await requireUserOrg();
  if (!auth.ok) {
    return NextResponse.redirect(
      buildSettingsUrl(request, { gmail_error: "not_authenticated" }).toString()
    );
  }

  try {
    const cfg = getGoogleOAuthConfig(request);
    const tokens = await exchangeCodeForTokens(code, cfg);

    if (!tokens.refresh_token) {
      // Google only returns refresh_token on first consent. We force
      // prompt=consent on every connect so this should be present; if not,
      // the user has an existing grant we can't reuse.
      const res = NextResponse.redirect(
        buildSettingsUrl(request, { gmail_error: "missing_refresh_token" }).toString()
      );
      res.cookies.delete("gmail_oauth_state");
      return res;
    }

    const googleEmail = await fetchUserEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminClient();
    const { error: upsertError } = await admin
      .from("gmail_credentials")
      .upsert(
        {
          user_id: auth.userId,
          org_id: auth.orgId,
          google_email: googleEmail,
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: encrypt(tokens.refresh_token),
          access_token_expires_at: expiresAt,
          scope: tokens.scope ?? GMAIL_SCOPES.join(" "),
          needs_reauth: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,org_id" }
      );

    if (upsertError) {
      console.error("[Gmail callback] DB upsert failed:", upsertError.message);
      const res = NextResponse.redirect(
        buildSettingsUrl(request, { gmail_error: "save_failed" }).toString()
      );
      res.cookies.delete("gmail_oauth_state");
      return res;
    }

    const res = NextResponse.redirect(
      buildSettingsUrl(request, { gmail: "connected" }).toString()
    );
    res.cookies.delete("gmail_oauth_state");
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[Gmail callback] error:", message);
    const res = NextResponse.redirect(
      buildSettingsUrl(request, {
        gmail_error: message.slice(0, 200),
      }).toString()
    );
    res.cookies.delete("gmail_oauth_state");
    return res;
  }
}
