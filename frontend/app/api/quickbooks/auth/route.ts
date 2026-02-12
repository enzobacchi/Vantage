import crypto from "crypto";
import OAuthClient from "intuit-oauth";
import { NextRequest, NextResponse } from "next/server";

import {
  createQBOAuthClient,
  getQBRedirectUriFromRequest,
} from "@/lib/quickbooks/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const redirectUri = getQBRedirectUriFromRequest(request);
  console.log("--- DEBUG: AUTH ROUTE TRIGGERED ---");
  console.log("1. redirectUri (from request host):", redirectUri);
  console.log("-------------------------------------");

  const oauthClient = createQBOAuthClient(redirectUri);
  const state = crypto.randomUUID();

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });

  const res = NextResponse.redirect(authUri);
  res.cookies.set({
    name: "qb_oauth_state",
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });
  return res;
}