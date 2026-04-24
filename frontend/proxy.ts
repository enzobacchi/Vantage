import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

// Routes that do NOT require an active subscription
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/terms", "/privacy", "/settings"]

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// Webhook/cron endpoints that receive external calls (not subject to CSRF)
const CSRF_EXEMPT = ["/api/stripe/webhook", "/api/cron/sync", "/api/cron/digest"]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

function isAllowedOrigin(origin: string | null, requestUrl: URL): boolean {
  if (!origin) return false
  if (origin === requestUrl.origin) return true
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) {
    try {
      if (origin === new URL(appUrl).origin) return true
    } catch { /* invalid URL */ }
  }
  if (process.env.NODE_ENV === "development") {
    try {
      const h = new URL(origin).hostname
      if (h === "localhost" || h === "127.0.0.1") return true
    } catch { return false }
  }
  return false
}

/** Apply security headers to every response. */
function applySecurityHeaders(response: NextResponse): void {
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://api.mapbox.com",
      "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://api.openai.com https://api.anthropic.com https://api.resend.com https://va.vercel-scripts.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  )
}

/**
 * Next.js 16 proxy (replaces deprecated middleware).
 * 1. CSRF protection — validates Origin on state-changing API requests.
 * 2. Security headers — CSP, HSTS, X-Frame-Options, etc.
 * 3. Refreshes the Supabase auth session on every request.
 * 4. Plan gating — redirects to billing settings when subscription is expired/canceled.
 */
export async function proxy(request: NextRequest) {
  const { method, nextUrl } = request
  const { pathname } = nextUrl

  // --- www → apex redirect for the marketing domain ---
  // The business card URL is www.vantagedonorai.com; the marketing site
  // lives at the apex. 308 keeps POST method semantics just in case.
  const host = request.headers.get("host")
  if (host === "www.vantagedonorai.com") {
    const target = `https://vantagedonorai.com${pathname}${nextUrl.search}`
    return NextResponse.redirect(target, 308)
  }

  // --- CSRF Protection for API mutation routes ---
  if (MUTATION_METHODS.has(method) && pathname.startsWith("/api/")) {
    if (!CSRF_EXEMPT.some((p) => pathname.startsWith(p))) {
      const origin = request.headers.get("origin")
      if (!isAllowedOrigin(origin, nextUrl)) {
        const res = NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 })
        applySecurityHeaders(res)
        return res
      }
    }
  }

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

  // --- Plan gating (skip in development) ---
  const isDev = process.env.NODE_ENV === "development"
  if (
    !isDev &&
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

  applySecurityHeaders(response)
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
