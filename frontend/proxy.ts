import { type NextRequest, NextResponse } from "next/server";

/**
 * Next.js 16 proxy (replaces deprecated middleware). Pass-through only;
 * auth is enforced in app (dashboard/donors layouts) and API routes.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
