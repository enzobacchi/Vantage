/**
 * API-key authentication for the public REST API (/api/v1).
 *
 * Mirrors requireUserOrg()'s discriminated-union shape, but resolves the org
 * from an `Authorization: Bearer vk_...` API key instead of a user session.
 */

import crypto from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export const API_KEY_PREFIX = "vk_live_";

export type ApiKeyAuth =
  | { ok: true; orgId: string; keyId: string; scopes: string[] }
  | { ok: false; response: Response };

export function apiErrorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Generate a new key. Returns the plaintext (shown once) + storage fields. */
export function generateApiKey(): {
  plaintext: string;
  keyHash: string;
  keyPrefix: string;
} {
  const plaintext = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
  return {
    plaintext,
    keyHash: hashApiKey(plaintext),
    keyPrefix: plaintext.slice(0, API_KEY_PREFIX.length + 4),
  };
}

/**
 * Resolve an API key from the request to its org. 401s on missing/unknown/
 * revoked keys. Updates last_used_at fire-and-forget, throttled to one write
 * per minute per key.
 */
export async function requireApiKeyOrg(request: Request): Promise<ApiKeyAuth> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: apiErrorResponse(
        401,
        "unauthorized",
        "Missing Authorization header. Pass your API key as: Authorization: Bearer vk_live_..."
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token.startsWith(API_KEY_PREFIX)) {
    return {
      ok: false,
      response: apiErrorResponse(401, "unauthorized", "Invalid API key format."),
    };
  }

  const supabase = createAdminClient();
  const { data: key } = await supabase
    .from("api_keys")
    .select("id, org_id, scopes, revoked_at, last_used_at")
    .eq("key_hash", hashApiKey(token))
    .maybeSingle();

  if (!key || key.revoked_at) {
    return {
      ok: false,
      response: apiErrorResponse(401, "unauthorized", "Invalid or revoked API key."),
    };
  }

  // Throttled last_used_at update (fire-and-forget)
  const lastUsed = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > 60_000) {
    void supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", key.id)
      .then(undefined, () => {});
  }

  return {
    ok: true,
    orgId: key.org_id as string,
    keyId: key.id as string,
    scopes: (key.scopes as string[]) ?? ["read"],
  };
}
