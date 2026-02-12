import crypto from "crypto";
import OAuthClient from "intuit-oauth";
import { NextResponse } from "next/server";

import { createQBOAuthClient } from "@/lib/quickbooks/client";

export const runtime = "nodejs";

export async function GET() {
  const oauthClient = createQBOAuthClient();
  const state = crypto.randomUUID();

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });

  return NextResponse.redirect(authUri);
}

