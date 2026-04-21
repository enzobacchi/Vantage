// Google OAuth 2.0 helpers for Gmail "send as" integration.
// Uses Google's official endpoints — no wrapper SDK.

import type { NextRequest } from "next/server";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function isLocalhostHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h.startsWith("127.0.0.1:") ||
    h === "[::1]" ||
    h.startsWith("[::1]:")
  );
}

function deriveRedirectUriFromRequest(request: NextRequest | Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  if (!host) {
    throw new Error("Could not determine request host for Gmail redirect URI.");
  }
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = isLocalhostHost(host) ? "http" : forwardedProto ?? "https";
  return `${proto}://${host}/api/gmail/callback`;
}

export function getGoogleOAuthConfig(
  request?: NextRequest | Request
): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET."
    );
  }
  const envRedirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const redirectUri =
    envRedirect && envRedirect.trim().length > 0
      ? envRedirect
      : request
        ? deriveRedirectUriFromRequest(request)
        : (() => {
            throw new Error(
              "GOOGLE_OAUTH_REDIRECT_URI is not set and no request was provided."
            );
          })();
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // force refresh_token reissue even on reconnect
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(
  code: string,
  cfg: GoogleOAuthConfig
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
  cfg: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Token refresh failed (${res.status}): ${text}`);
    (err as Error & { googleStatus?: number; googleBody?: string }).googleStatus = res.status;
    (err as Error & { googleStatus?: number; googleBody?: string }).googleBody = text;
    throw err;
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`userinfo fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { email?: string };
  if (!json.email) {
    throw new Error("userinfo response missing email");
  }
  return json.email;
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // best-effort; ignore network errors
  }
}

export function isInvalidGrantError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const body = (err as Error & { googleBody?: string }).googleBody;
  return !!body && /invalid_grant/.test(body);
}
