import OAuthClient from "intuit-oauth";

function getQuickBooksEnv() {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = process.env.QB_REDIRECT_URI;
  const environment = process.env.QB_ENVIRONMENT;

  if (!clientId || !clientSecret || !redirectUri || !environment) {
    throw new Error(
      "Missing QuickBooks env vars. Set QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI, QB_ENVIRONMENT."
    );
  }

  if (environment !== "sandbox" && environment !== "production") {
    throw new Error('QB_ENVIRONMENT must be "sandbox" or "production".');
  }

  return { clientId, clientSecret, redirectUri, environment };
}

export function createQBOAuthClient() {
  const { clientId, clientSecret, redirectUri, environment } = getQuickBooksEnv();

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

