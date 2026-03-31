import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const AUTH_NEXT_COOKIE = "auth_next_redirect";
const STRIPE_CHECKOUT_COOKIE = "stripe_checkout_session_id";

/**
 * Handles redirects from Supabase after email confirmation or OAuth.
 * Exchange the code for a session, then redirect to /dashboard (or ?next=).
 * Falls back to auth_next_redirect cookie when ?next= is lost (e.g. invite flow).
 * If a stripe_checkout_session_id cookie exists (Payment Link flow), it is
 * forwarded as a query param so the dashboard can complete the linking.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieNext = cookieHeader.match(new RegExp(`${AUTH_NEXT_COOKIE}=([^;]+)`))?.[1];
  const cookieCheckout = cookieHeader.match(new RegExp(`${STRIPE_CHECKOUT_COOKIE}=([^;]+)`))?.[1];
  const next = nextParam ?? (cookieNext ? decodeURIComponent(cookieNext) : null) ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Auth callback exchange error:", error.message);
      // For password recovery, redirect to reset page with error so user can retry
      if (next === "/reset-password") {
        return NextResponse.redirect(new URL("/reset-password?error=expired", url.origin));
      }
      return NextResponse.redirect(new URL("/login?error=callback", url.origin));
    }
  }

  // Build the redirect URL — append checkout_session_id if present (Payment Link flow)
  const redirectUrl = new URL(next, url.origin);
  if (cookieCheckout) {
    redirectUrl.searchParams.set("checkout_session_id", decodeURIComponent(cookieCheckout));
  }

  const res = NextResponse.redirect(redirectUrl);
  // Clear cookies after use
  if (cookieNext) {
    res.cookies.set(AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  }
  if (cookieCheckout) {
    res.cookies.set(STRIPE_CHECKOUT_COOKIE, "", { maxAge: 0, path: "/" });
  }
  return res;
}
