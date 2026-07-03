import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

// Routes that do NOT require an active subscription
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/terms", "/privacy", "/settings", "/docs"]

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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://va.vercel-scripts.com https://api.mapbox.com",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
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

// API route prefixes that must keep working even when a subscription is
// inactive — so the user can still pay/manage billing, reconnect integrations,
// and so webhooks/cron keep flowing.
const BILLING_EXEMPT_API = [
  "/api/stripe/", // checkout, portal, status, webhook
  "/api/cron/", // scheduled jobs (authenticated via CRON_SECRET)
  "/api/quickbooks/", // OAuth connect + callback
  "/api/auth/", // auth callbacks
]

/**
 * Mirror of lib/auth.ts pickBestMembership: prefer a multi-member (real shared)
 * org over a solo auto-created placeholder, so plan gating scopes to the same
 * org the rest of the app uses. Returns null when the user has no membership.
 */
async function pickGatingOrgId(
  admin: ReturnType<typeof createServerClient>,
  userId: string
): Promise<string | null> {
  const { data: members } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (!members || members.length === 0) return null

  const orgIds = members.map((m: { organization_id: string }) => m.organization_id)
  const { data: allMembers } = await admin
    .from("organization_members")
    .select("organization_id")
    .in("organization_id", orgIds)

  const countByOrg = new Map<string, number>()
  for (const row of allMembers ?? []) {
    countByOrg.set(row.organization_id, (countByOrg.get(row.organization_id) ?? 0) + 1)
  }

  // Prefer a multi-member org (in recency order), else fall back to most recent.
  for (const m of members) {
    if ((countByOrg.get(m.organization_id) ?? 0) > 1) return m.organization_id
  }
  return members[0].organization_id
}

/**
 * Next.js 16 proxy (replaces deprecated middleware).
 * 1. CSRF protection — validates Origin on state-changing API requests.
 * 2. Security headers — CSP, HSTS, X-Frame-Options, etc.
 * 3. Refreshes the Supabase auth session on every request.
 * 4. Plan gating — blocks the app (page redirect + 402 on data APIs) when the
 *    trial has expired or the subscription is inactive; billing/auth stay open.
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
  const isApiRoute = pathname.startsWith("/api/")

  const isGateablePage =
    !isApiRoute &&
    !isPublicPath(pathname) &&
    !pathname.startsWith("/_next/") &&
    !pathname.includes(".")

  // Gate data APIs too (defense-in-depth for direct web calls), except the
  // billing/auth/webhook/cron endpoints the user still needs while locked out.
  const isGateableApi =
    isApiRoute && !BILLING_EXEMPT_API.some((p) => pathname.startsWith(p))

  if (!isDev && user && (isGateablePage || isGateableApi)) {
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

    const orgId = await pickGatingOrgId(admin, user.id)

    if (orgId) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("status, trial_ends_at")
        .eq("org_id", orgId)
        .single()

      if (sub) {
        let shouldBlock = false

        // Expired trial
        if (sub.status === "trialing" && sub.trial_ends_at) {
          shouldBlock = new Date(sub.trial_ends_at) < new Date()
        }

        // Inactive subscription (canceled, past_due, unpaid)
        if (sub.status !== "active" && sub.status !== "trialing") {
          shouldBlock = true
        }

        if (shouldBlock) {
          if (isApiRoute) {
            const res = NextResponse.json(
              {
                error: "subscription_required",
                message:
                  "Your trial has ended. Choose a plan in Settings → Billing to continue.",
              },
              { status: 402 }
            )
            applySecurityHeaders(res)
            return res
          }
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
