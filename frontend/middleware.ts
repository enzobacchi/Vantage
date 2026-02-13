import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware runs on the Edge. Supabase SSR was causing MIDDLEWARE_INVOCATION_FAILED
 * on Vercel, so auth is handled in the app (dashboard layout / API requireUserOrg).
 * This file just passes all requests through.
 */
export async function middleware(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
