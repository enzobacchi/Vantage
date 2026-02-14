import crypto from "crypto";
import OAuthClient from "intuit-oauth";
import { NextRequest, NextResponse } from "next/server";

import {
  createQBOAuthClient,
  getQBRedirectUriFromRequest,
} from "@/lib/quickbooks/client";

export const runtime = "nodejs";

function htmlResponse(status: number, title: string, body: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;max-width:560px;margin:2rem auto;padding:0 1rem;"><h1>${title}</h1><p>${body}</p><p><a href="/login">Back to login</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  try {
    try {
      const redirectUri = getQBRedirectUriFromRequest(request);
      const oauthClient = createQBOAuthClient(redirectUri);
      const state = crypto.randomUUID();

      const authUri = oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting],
        state,
      });

      const res = NextResponse.redirect(authUri);
      res.cookies.set({
        name: "qb_oauth_state",
        value: state,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 10, // 10 minutes
      });
      return res;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[QuickBooks auth]", message);
      const isConfig =
        /missing quickbooks env|redirect uri|QB_|could not determine/i.test(message) ||
        message.includes("sandbox") ||
        message.includes("production");

      const proto = request.headers.get("x-forwarded-proto") ?? "https";
      const host =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      if (host) {
        const toLogin = new URL("/login", `${proto}://${host}`);
        toLogin.searchParams.set(
          "error",
          isConfig ? "qb_not_configured" : "qb_error"
        );
        return NextResponse.redirect(toLogin.toString());
      }
      return htmlResponse(
        503,
        "QuickBooks sign-in unavailable",
        isConfig
          ? "QuickBooks is not configured for this deployment. In Vercel → Project → Settings → Environment Variables, add QB_CLIENT_ID, QB_CLIENT_SECRET, and QB_ENVIRONMENT for both <strong>Production</strong> and <strong>Preview</strong> if you use preview URLs."
          : "QuickBooks sign-in failed. Try again or use email login."
      );
    }
  } catch (fallbackError) {
    // Ensure we never return 500: catch any unexpected throw (e.g. from redirect)
    return htmlResponse(
      503,
      "QuickBooks sign-in unavailable",
      "Something went wrong. Check that QB_CLIENT_ID, QB_CLIENT_SECRET, and QB_ENVIRONMENT are set in Vercel for this environment, and that your Intuit app redirect URI matches this site (e.g. https://vantage-rust-six.vercel.app/api/quickbooks/callback)."
    );
  }
}