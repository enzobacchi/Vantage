import { NextResponse } from "next/server";

import { createQBOAuthClient } from "@/lib/quickbooks/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const realmId = url.searchParams.get("realmId");

  if (!realmId) {
    return NextResponse.json(
      { error: "Missing realmId from QuickBooks callback." },
      { status: 400 }
    );
  }

  const oauthClient = createQBOAuthClient();

  try {
    const authResponse = await oauthClient.createToken(request.url);
    const tokenJson = authResponse.getJson();

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: "QuickBooks token exchange succeeded but tokens missing." },
        { status: 500 }
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("organizations")
      .upsert(
        {
          name: "Default Organization",
          qb_realm_id: realmId,
          qb_access_token: accessToken,
          qb_refresh_token: refreshToken,
        },
        { onConflict: "qb_realm_id" }
      );

    if (error) {
      return NextResponse.json(
        { error: "Failed to save tokens to Supabase.", details: error.message },
        { status: 500 }
      );
    }

    const redirectTo = new URL("/settings", url.origin);
    redirectTo.searchParams.set("qb", "connected");
    redirectTo.searchParams.set("realmId", realmId);
    return NextResponse.redirect(redirectTo);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "QuickBooks callback failed.", details: message },
      { status: 400 }
    );
  }
}

