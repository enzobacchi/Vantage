/**
 * Shared QuickBooks request plumbing used by both pull-sync
 * (lib/sync/run-sync.ts) and write-back (lib/quickbooks/writeback.ts):
 * token refresh with concurrent-refresh detection, a retry wrapper for
 * 401/expired-token API calls, and low-level query/post helpers.
 */

import { createQBOAuthClient, getQBApiBaseUrl } from "@/lib/quickbooks/client";
import { decryptQbToken, encryptQbToken } from "@/lib/quickbooks/token-crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

export class QBApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type QBTokenManager = {
  readonly accessToken: string;
  readonly refreshToken: string;
  refreshTokens: () => Promise<void>;
  withTokenRefreshRetry: <T>(fn: () => Promise<T>) => Promise<T>;
};

/**
 * Token lifecycle manager for one org's QB connection. Mirrors the behavior
 * that lived inline in run-sync: refresh via refreshUsingToken() (refresh()
 * calls validateToken() which always fails for DB-loaded tokens), re-read
 * the DB before refreshing to adopt tokens a concurrent process already
 * refreshed, and persist new tokens immediately.
 */
export function createQBTokenManager(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  initial: { accessToken: string; refreshToken: string }
): QBTokenManager {
  let accessToken = initial.accessToken;
  let refreshToken = initial.refreshToken;

  const oauthClient = createQBOAuthClient();
  oauthClient.setToken({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  async function refreshTokens(): Promise<void> {
    // Re-read from DB: another concurrent sync may have already refreshed
    const { data: freshOrg, error: freshOrgError } = await supabase
      .from("organizations")
      .select("qb_access_token, qb_refresh_token")
      .eq("id", orgId)
      .maybeSingle();

    // Stored tokens are encrypted at rest (AES-GCM produces fresh ciphertext
    // per write), so compare decrypted values, never the stored blobs.
    const freshRefresh = decryptQbToken(freshOrg?.qb_refresh_token);
    if (!freshOrgError && freshRefresh && freshRefresh !== refreshToken) {
      // Another process already refreshed — adopt the newer tokens
      accessToken = decryptQbToken(freshOrg?.qb_access_token) ?? "";
      refreshToken = freshRefresh;
      oauthClient.setToken({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      console.log(`[QB] org=${orgId} adopted tokens refreshed by another process`);
      return;
    }

    const refreshed = await oauthClient.refreshUsingToken(refreshToken);
    const refreshedJson = refreshed.getJson();
    const newAccess = refreshedJson.access_token;
    const newRefresh = refreshedJson.refresh_token;
    if (!newAccess || !newRefresh) {
      throw new Error("QuickBooks token refresh returned missing tokens.");
    }

    accessToken = newAccess;
    refreshToken = newRefresh;

    const { error: tokenSaveError } = await supabase
      .from("organizations")
      .update({
        qb_access_token: encryptQbToken(accessToken),
        qb_refresh_token: encryptQbToken(refreshToken),
      })
      .eq("id", orgId);

    if (tokenSaveError) {
      throw new Error(`Failed to persist refreshed tokens: ${tokenSaveError.message}`);
    }
  }

  async function withTokenRefreshRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      if (!accessToken) await refreshTokens();
      return await fn();
    } catch (e) {
      const qbErr = e instanceof QBApiError ? e : null;
      const shouldRetry =
        qbErr?.status === 401 ||
        (typeof qbErr?.body === "string" && qbErr.body.toLowerCase().includes("token"));
      if (!shouldRetry) throw e;
      await refreshTokens();
      return await fn();
    }
  }

  return {
    get accessToken() {
      return accessToken;
    },
    get refreshToken() {
      return refreshToken;
    },
    refreshTokens,
    withTokenRefreshRetry,
  };
}

/** Run a QB SQL-ish query (`select * from Customer where ...`). */
export async function qbQuery<T = unknown>(
  realmId: string,
  accessToken: string,
  query: string
): Promise<Record<string, T[] | undefined>> {
  const endpoint = new URL(
    `${getQBApiBaseUrl()}/v3/company/${encodeURIComponent(realmId)}/query`
  );
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("minorversion", "65");

  const res = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new QBApiError(`QuickBooks query failed (${res.status})`, res.status, body);
  }

  const data = (await res.json()) as { QueryResponse?: Record<string, T[] | undefined> };
  return data.QueryResponse ?? {};
}

/** Create a QB entity (POST /v3/company/<realm>/<entity>). Returns the created entity. */
export async function qbCreate<T = Record<string, unknown>>(
  realmId: string,
  accessToken: string,
  entity: string,
  body: Record<string, unknown>
): Promise<T> {
  const endpoint = new URL(
    `${getQBApiBaseUrl()}/v3/company/${encodeURIComponent(realmId)}/${entity.toLowerCase()}`
  );
  endpoint.searchParams.set("minorversion", "65");

  const res = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new QBApiError(
      `QuickBooks ${entity} create failed (${res.status})`,
      res.status,
      errBody
    );
  }

  const data = (await res.json()) as Record<string, T>;
  // QB wraps the created entity under its type name: { "SalesReceipt": {...} }
  const created = data[entity];
  if (!created) {
    throw new QBApiError(`QuickBooks ${entity} create returned no entity`, 500, JSON.stringify(data));
  }
  return created;
}
