import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

// Routes that do NOT require an active subscription
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/terms", "/privacy", "/settings"]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

/**
 * Next.js 16 proxy (replaces deprecated middleware).
 * 1. Refreshes the Supabase auth session on every request.
 * 2. Plan gating — redirects to billing settings when subscription is expired/canceled.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // --- Plan gating ---
  const { pathname } = request.nextUrl
  if (
    user &&
    !isPublicPath(pathname) &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.includes(".")
  ) {
    // Use service role to check subscription (bypasses RLS)
    const admin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return [] },
          setAll() {},
        },
      }
    )

    const { data: member } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (member?.organization_id) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("status, trial_ends_at")
        .eq("org_id", member.organization_id)
        .single()

      if (sub) {
        let shouldRedirect = false

        // Expired trial
        if (sub.status === "trialing" && sub.trial_ends_at) {
          shouldRedirect = new Date(sub.trial_ends_at) < new Date()
        }

        // Inactive subscription (canceled, past_due, unpaid)
        if (sub.status !== "active" && sub.status !== "trialing") {
          shouldRedirect = true
        }

        if (shouldRedirect) {
          const billingUrl = new URL("/settings?tab=billing", request.url)
          return NextResponse.redirect(billingUrl)
        }
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
