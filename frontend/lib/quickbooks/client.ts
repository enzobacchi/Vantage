import OAuthClient from "intuit-oauth";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
const redirectUriDefault = `${appUrl}/api/quickbooks/callback`;

/** Redirect URI: QB_REDIRECT_URI override or dynamic default from NEXT_PUBLIC_APP_URL. */
export function getQBRedirectUri(): string {
  return process.env.QB_REDIRECT_URI || redirectUriDefault;
}

/** Build redirect URI from request origin so cookie and callback share the same host. */
export function getQBRedirectUriFromRequest(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = url.protocol.replace(":", "");
  const scheme = forwardedProto ?? (proto || "https");
  const origin = `${scheme}://${host}`;
  return `${origin}/api/quickbooks/callback`;
}

function getQuickBooksEnv(redirectUriOverride?: string) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = redirectUriOverride ?? getQBRedirectUri();
  const environment = process.env.QB_ENVIRONMENT;

  if (!clientId || !clientSecret || !environment) {
    throw new Error(
      "Missing QuickBooks env vars. Set QB_CLIENT_ID, QB_CLIENT_SECRET, QB_ENVIRONMENT."
    );
  }

  if (!redirectUri || redirectUri === "/api/quickbooks/callback") {
    throw new Error(
      "QuickBooks redirect URI is missing. Set QB_REDIRECT_URI or NEXT_PUBLIC_APP_URL (e.g. your Ngrok URL)."
    );
  }

  if (environment !== "sandbox" && environment !== "production") {
    throw new Error('QB_ENVIRONMENT must be "sandbox" or "production".');
  }

  return { clientId, clientSecret, redirectUri, environment };
}

export function createQBOAuthClient(redirectUriOverride?: string) {
  const { clientId, clientSecret, redirectUri, environment } = getQuickBooksEnv(redirectUriOverride);

  return new OAuthClient({
    clientId,
    clientSecret,
    environment,
    redirectUri,
  });
}

export function getQBApiBaseUrl() {
  const env = process.env.QB_ENVIRONMENT;
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

