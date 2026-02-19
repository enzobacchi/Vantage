import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const AUTH_NEXT_COOKIE = "auth_next_redirect";

/**
 * Handles redirects from Supabase after email confirmation or OAuth.
 * Exchange the code for a session, then redirect to /dashboard (or ?next=).
 * Falls back to auth_next_redirect cookie when ?next= is lost (e.g. invite flow).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const cookieNext = request.headers.get("cookie")?.match(new RegExp(`${AUTH_NEXT_COOKIE}=([^;]+)`))?.[1];
  const next = nextParam ?? (cookieNext ? decodeURIComponent(cookieNext) : null) ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Auth callback exchange error:", error.message);
      return NextResponse.redirect(new URL("/login?error=callback", url.origin));
    }
  }

  const res = NextResponse.redirect(new URL(next, url.origin));
  // Clear the fallback cookie after use
  if (cookieNext) {
    res.cookies.set(AUTH_NEXT_COOKIE, "", { maxAge: 0, path: "/" });
  }
  return res;
}
