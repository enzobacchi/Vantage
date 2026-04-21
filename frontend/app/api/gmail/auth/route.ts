import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { getGoogleOAuthConfig, buildAuthorizeUrl } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

function htmlResponse(status: number, title: string, body: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;max-width:560px;margin:2rem auto;padding:0 1rem;"><h1>${title}</h1><p>${body}</p><p><a href="/settings?tab=integrations">Back to settings</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  try {
    const { clientId, redirectUri } = getGoogleOAuthConfig(request);
    const state = crypto.randomUUID();
    const authUri = buildAuthorizeUrl({ clientId, redirectUri, state });

    // Intermediate HTML page so the state cookie is persisted before the
    // browser navigates to Google — same Safari ITP workaround as the QB flow.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connecting to Gmail…</title><meta http-equiv="refresh" content="1;url=${authUri}"><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa}p{font-size:1.125rem;color:#444}</style></head><body><p>Redirecting to Google…</p><script>setTimeout(function(){window.location.href=${JSON.stringify(authUri)}},500)</script></body></html>`;

    const res = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    res.cookies.set({
      name: "gmail_oauth_state",
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 30,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[Gmail auth]", message);
    const isConfig = /GOOGLE_OAUTH|redirect uri|could not determine/i.test(message);
    return htmlResponse(
      503,
      "Gmail sign-in unavailable",
      isConfig
        ? "Gmail is not configured for this deployment. In Vercel → Project → Settings → Environment Variables, add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET for both <strong>Production</strong> and <strong>Preview</strong>."
        : "Gmail sign-in failed. Try again."
    );
  }
}
