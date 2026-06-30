/**
 * Route-handler wrapper + shared helpers for the public REST API (/api/v1).
 *
 * Composes, in order: API-key auth → scope check → plan gate (Growth and
 * above) → per-key rate limit → handler, with a JSON error envelope
 * ({ error: { code, message } }) on every failure path. Success responses
 * use { data, pagination } via jsonData()/jsonList().
 */

import { apiErrorResponse, requireApiKeyOrg } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgSubscription, isTrialExpired } from "@/lib/subscription";
import { encodeCursor, decodeCursor } from "@/lib/api-cursor";

export { encodeCursor, decodeCursor };

const RATE_LIMIT_MAX = 60; // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // per minute, per key (per instance)

export const API_PAGE_DEFAULT = 25;
export const API_PAGE_MAX = 100;

// Explicit contact field list — never select *. Excludes embedding,
// assigned_to, notes, and internal scoring.
export const CONTACT_FIELDS =
  "id, external_id, display_name, first_name, last_name, email, phone, donor_type, billing_address, city, state, zip, mailing_address, mailing_city, mailing_state, mailing_zip, custom_fields, qb_customer_id, total_lifetime_value, last_donation_date, last_donation_amount, created_at";

export type ApiV1Context = {
  orgId: string;
  keyId: string;
  scopes: string[];
  params: Record<string, string>;
};

type RouteSegment = { params: Promise<Record<string, string>> };

/** Plans with public API access. Trials qualify when trialing a qualifying tier. */
async function hasApiAccess(orgId: string): Promise<boolean> {
  const sub = await getOrgSubscription(orgId);
  if (["growth", "pro", "enterprise"].includes(sub.planId)) return true;
  if (sub.planId === "trial" && sub.trialTier && ["growth", "pro"].includes(sub.trialTier)) {
    // A lapsed trial keeps planId "trial"; don't grant API access past expiry.
    return !isTrialExpired(sub.trialEndsAt);
  }
  return false;
}

export function withApiV1(
  handler: (req: Request, ctx: ApiV1Context) => Promise<Response>,
  opts?: { scope?: "read" | "write" }
): (req: Request, segment?: RouteSegment) => Promise<Response> {
  const requiredScope = opts?.scope ?? "read";

  return async (req: Request, segment?: RouteSegment): Promise<Response> => {
    try {
      const auth = await requireApiKeyOrg(req);
      if (!auth.ok) return auth.response;

      if (!auth.scopes.includes(requiredScope)) {
        return apiErrorResponse(
          403,
          "insufficient_scope",
          `This API key does not have the "${requiredScope}" scope.`
        );
      }

      if (!(await hasApiAccess(auth.orgId))) {
        return apiErrorResponse(
          403,
          "plan_required",
          "API access requires the Growth plan or above. Upgrade in Settings → Billing."
        );
      }

      const limited = checkRateLimit(
        `apikey:${auth.keyId}`,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      );
      if (limited.limited) {
        const retryAfterSec = Math.ceil(limited.retryAfterMs / 1000);
        return new Response(
          JSON.stringify({
            error: {
              code: "rate_limited",
              message: `Too many requests. Retry in ${retryAfterSec}s.`,
            },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfterSec),
            },
          }
        );
      }

      const params = segment ? await segment.params : {};
      return await handler(req, {
        orgId: auth.orgId,
        keyId: auth.keyId,
        scopes: auth.scopes,
        params,
      });
    } catch (e) {
      console.error("[api/v1] unhandled error:", e);
      return apiErrorResponse(500, "internal_error", "Something went wrong.");
    }
  };
}

// ---------------------------------------------------------------------------
// Response + pagination helpers
// ---------------------------------------------------------------------------

export function jsonData(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function jsonList(
  data: unknown[],
  pagination: { has_more: boolean; next_cursor: string | null }
): Response {
  return new Response(JSON.stringify({ data, pagination }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function parseLimit(searchParams: URLSearchParams): number {
  const raw = parseInt(searchParams.get("limit") ?? String(API_PAGE_DEFAULT), 10);
  if (isNaN(raw)) return API_PAGE_DEFAULT;
  return Math.min(API_PAGE_MAX, Math.max(1, raw));
}
