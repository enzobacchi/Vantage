import { NextResponse } from "next/server";
import OpenAI from "openai";

import { createQBOAuthClient, getQBApiBaseUrl } from "@/lib/quickbooks/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

class QBApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type QBCustomer = {
  Id?: string;
  Active?: boolean;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    Line3?: string;
    Line4?: string;
    Line5?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
  };
};

type QBSalesReceipt = {
  Id?: string;
  TxnDate?: string; // YYYY-MM-DD
  TotalAmt?: number;
  CustomerRef?: { value?: string; name?: string };
  PrivateNote?: string;
  DocNumber?: string;
};

function stringifyBillAddr(billAddr: QBCustomer["BillAddr"]) {
  if (!billAddr) return "";
  const lines = [
    billAddr.Line1,
    billAddr.Line2,
    billAddr.Line3,
    billAddr.Line4,
    billAddr.Line5,
  ].filter(Boolean);
  const cityLine = [billAddr.City, billAddr.CountrySubDivisionCode, billAddr.PostalCode]
    .filter(Boolean)
    .join(", ");
  const parts = [...lines, cityLine, billAddr.Country].filter((x) => !!x && x.trim().length);
  return parts.join(", ");
}

async function geocodeAddress(address: string) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !address) return null;

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      address
    )}.json`
  );
  endpoint.searchParams.set("access_token", token);
  endpoint.searchParams.set("limit", "1");

  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{ center?: [number, number] }>;
  };

  const center = data.features?.[0]?.center;
  if (!center) return null;
  const [lng, lat] = center;
  return { lat, lng };
}

async function fetchQBCustomers(realmId: string, accessToken: string) {
  const base = getQBApiBaseUrl();
  // QBO Query API can be picky about selecting complex types; `select *` is safest for MVP.
  const query = "select * from Customer";
  const endpoint = new URL(`${base}/v3/company/${encodeURIComponent(realmId)}/query`);
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
    throw new QBApiError(
      `QuickBooks customers query failed (${res.status})`,
      res.status,
      body
    );
  }

  const data = (await res.json()) as {
    QueryResponse?: { Customer?: QBCustomer[] };
  };

  return data.QueryResponse?.Customer ?? [];
}

async function fetchQBSalesReceipts({
  realmId,
  accessToken,
  maxToFetch,
}: {
  realmId: string;
  accessToken: string;
  maxToFetch: number;
}) {
  const base = getQBApiBaseUrl();

  const pageSize = 100;
  let startPosition = 1;
  const receipts: QBSalesReceipt[] = [];

  while (receipts.length < maxToFetch) {
    const remaining = maxToFetch - receipts.length;
    const take = Math.min(pageSize, remaining);

    const query = `select Id, TxnDate, TotalAmt, CustomerRef, PrivateNote, DocNumber from SalesReceipt orderby TxnDate desc startposition ${startPosition} maxresults ${take}`;
    const endpoint = new URL(`${base}/v3/company/${encodeURIComponent(realmId)}/query`);
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
      throw new QBApiError(
        `QuickBooks SalesReceipt query failed (${res.status})`,
        res.status,
        body
      );
    }

    const data = (await res.json()) as {
      QueryResponse?: { SalesReceipt?: QBSalesReceipt[] };
    };

    const page = data.QueryResponse?.SalesReceipt ?? [];
    receipts.push(...page);

    if (page.length < take) break;
    startPosition += page.length;
  }

  return receipts.slice(0, maxToFetch);
}

function daysAgo(isoDate: string) {
  const today = new Date();
  const d = new Date(`${isoDate}T00:00:00Z`);
  const diffMs = today.getTime() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

async function embedTexts(openai: OpenAI, inputs: string[]) {
  const embeddings: number[][] = [];
  const batchSize = 100;
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    embeddings.push(...res.data.map((x) => x.embedding));
  }
  return embeddings;
}

export async function GET(request: Request) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY for embeddings." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const url = new URL(request.url);
    const realmIdParam = url.searchParams.get("realmId");

    const supabase = createAdminClient();

    const orgQuery = realmIdParam
      ? supabase
          .from("organizations")
          .select("id,qb_realm_id,qb_access_token,qb_refresh_token")
          .eq("qb_realm_id", realmIdParam)
          .maybeSingle()
      : supabase
          .from("organizations")
          .select("id,qb_realm_id,qb_access_token,qb_refresh_token")
          .not("qb_refresh_token", "is", null)
          .limit(1)
          .maybeSingle();

    const { data: org, error: orgError } = await orgQuery;
    if (orgError || !org?.qb_realm_id || !org?.qb_refresh_token) {
      const details = orgError?.message;
      const looksLikeMissingTables =
        typeof details === "string" &&
        details.includes("schema cache") &&
        details.includes("Could not find the table");

      return NextResponse.json(
        {
          error: looksLikeMissingTables
            ? "Supabase tables are missing. Run the migrations in `supabase/migrations/*` on your Supabase database, then reload the schema cache."
            : "No connected QuickBooks organization found. Connect QuickBooks first.",
          details,
        },
        { status: looksLikeMissingTables ? 500 : 400 }
      );
    }

    const orgId = org.id;
    const orgRealmId = org.qb_realm_id;

    // Prefer existing access token; only refresh if QuickBooks returns 401/invalid token.
    let accessToken = org.qb_access_token ?? "";
    let refreshToken = org.qb_refresh_token ?? "";

    const oauthClient = createQBOAuthClient();
    oauthClient.setToken({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    async function refreshTokens() {
      try {
        const refreshed = await oauthClient.refresh();
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
            qb_access_token: accessToken,
            qb_refresh_token: refreshToken,
          })
          .eq("id", orgId);

        if (tokenSaveError) {
          throw new Error(`Failed to persist refreshed tokens: ${tokenSaveError.message}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        // Intuit-oauth uses this exact message when refresh token is invalid.
        if (msg.includes("Refresh token is invalid")) {
          throw new Error(
            "QuickBooks refresh token is invalid/expired. Please reconnect QuickBooks in Settings."
          );
        }
        throw e;
      }
    }

    let customers: QBCustomer[] = [];
    let receipts: QBSalesReceipt[] = [];

    try {
      if (!accessToken) await refreshTokens();
      customers = await fetchQBCustomers(orgRealmId, accessToken);
      receipts = await fetchQBSalesReceipts({
        realmId: orgRealmId,
        accessToken,
        maxToFetch: 1000,
      });
    } catch (e) {
      // If QuickBooks says token invalid, refresh once and retry.
      const qbErr = e instanceof QBApiError ? e : null;
      const shouldRetry =
        qbErr?.status === 401 ||
        (typeof qbErr?.body === "string" && qbErr.body.toLowerCase().includes("token"));

      if (shouldRetry) {
        await refreshTokens();
        customers = await fetchQBCustomers(orgRealmId, accessToken);
        receipts = await fetchQBSalesReceipts({
          realmId: orgRealmId,
          accessToken,
          maxToFetch: 1000,
        });
      } else {
        throw e;
      }
    }

  // Aggregate donations by customer.
  const totalsByCustomer = new Map<string, { total: number; lastDate: string }>();
  for (const r of receipts) {
    const qbCustomerId = r.CustomerRef?.value;
    const amt = typeof r.TotalAmt === "number" ? r.TotalAmt : 0;
    const date = r.TxnDate;
    if (!qbCustomerId || !date) continue;

    const existing = totalsByCustomer.get(qbCustomerId);
    if (!existing) {
      totalsByCustomer.set(qbCustomerId, { total: amt, lastDate: date });
      continue;
    }

    existing.total += amt;
    if (date > existing.lastDate) existing.lastDate = date;
  }

  let geocodedCount = 0;
  let embeddedCount = 0;
  const donorsToUpsert: Array<Record<string, unknown>> = [];
  const embeddingInputs: string[] = [];
  const qbCustomerIdsInUpsert: string[] = [];

  for (const c of customers) {
    const qbCustomerId = c.Id;
    if (!qbCustomerId) continue;

    const billingAddress = stringifyBillAddr(c.BillAddr);
    const coords = billingAddress ? await geocodeAddress(billingAddress) : null;
    if (coords) geocodedCount += 1;

    const name = c.DisplayName ?? "Unknown";
    const city = c.BillAddr?.City ?? "Unknown";

    const agg = totalsByCustomer.get(qbCustomerId);
    const total = agg ? agg.total : 0;
    const lastGift = agg ? agg.lastDate : null;
    const days = lastGift ? daysAgo(lastGift) : null;

    const summary = `Donor: ${name}, Location: ${city}, LTV: $${total.toFixed(
      2
    )}, Last Gift: ${lastGift ?? "none"}${days !== null ? ` (${days} days ago)` : ""}`;

    donorsToUpsert.push({
      org_id: orgId,
      qb_customer_id: qbCustomerId,
      display_name: c.DisplayName ?? null,
      email: c.PrimaryEmailAddr?.Address ?? null,
      phone: c.PrimaryPhone?.FreeFormNumber ?? null,
      billing_address: billingAddress || null,
      location_lat: coords?.lat ?? null,
      location_lng: coords?.lng ?? null,
      total_lifetime_value: total,
      last_donation_date: lastGift,
      embedding: null,
    });

    qbCustomerIdsInUpsert.push(qbCustomerId);
    embeddingInputs.push(summary);
  }

  // Embed in batches and attach to donors.
  if (embeddingInputs.length) {
    const embeddings = await embedTexts(openai, embeddingInputs);
    for (let i = 0; i < donorsToUpsert.length; i++) {
      const emb = embeddings[i];
      if (emb) {
        donorsToUpsert[i].embedding = emb;
        embeddedCount += 1;
      }
    }
  }

  if (donorsToUpsert.length) {
    const { data: upsertedDonors, error: upsertError } = await supabase
      .from("donors")
      .upsert(donorsToUpsert, { onConflict: "org_id,qb_customer_id" })
      .select("id,qb_customer_id");

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to upsert donors.", details: upsertError.message },
        { status: 500 }
      );
    }

    // Insert donation rows for fetched receipts (best-effort, last 1000).
    const donorIdByQbCustomerId = new Map<string, string>();
    for (const d of upsertedDonors ?? []) {
      if (d?.qb_customer_id && d?.id) donorIdByQbCustomerId.set(d.qb_customer_id, d.id);
    }

    const donationsToUpsert: Array<Record<string, unknown>> = [];
    for (const r of receipts) {
      const qbCustomerId = r.CustomerRef?.value;
      if (!qbCustomerId) continue;
      const donorId = donorIdByQbCustomerId.get(qbCustomerId);
      if (!donorId) continue;

      const amount = typeof r.TotalAmt === "number" ? r.TotalAmt : null;
      const date = r.TxnDate ?? null;
      if (amount === null || !date) continue;

      const receiptId = r.Id ?? "";
      const note = r.PrivateNote?.trim();
      const doc = r.DocNumber?.trim();
      const memo = `qb_sales_receipt_id:${receiptId}${
        note ? ` ${note}` : doc ? ` SalesReceipt #${doc}` : ""
      }`;

      donationsToUpsert.push({
        donor_id: donorId,
        amount,
        date,
        memo,
      });
    }

    if (donationsToUpsert.length) {
      const { error: donationsError } = await supabase
        .from("donations")
        .upsert(donationsToUpsert, { onConflict: "donor_id,memo" });

      if (donationsError) {
        return NextResponse.json(
          { error: "Failed to upsert donations.", details: donationsError.message },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    realmId: orgRealmId,
    customersFetched: customers.length,
    salesReceiptsFetched: receipts.length,
    donorsUpserted: donorsToUpsert.length,
    donorsGeocoded: geocodedCount,
    donorsEmbedded: embeddedCount,
  });
  } catch (e) {
    if (e instanceof QBApiError) {
      return NextResponse.json(
        {
          error: "Sync failed (QuickBooks API error).",
          details: e.message,
          qbStatus: e.status,
          qbBody: e.body,
        },
        { status: 502 }
      );
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Sync failed.", details: message },
      { status: message.includes("reconnect QuickBooks") ? 401 : 500 }
    );
  }
}

