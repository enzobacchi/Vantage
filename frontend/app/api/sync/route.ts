import { NextResponse } from "next/server";
import OpenAI from "openai";

import { requireUserOrg } from "@/lib/auth";
import {
  getCityStateZipFromBillAddr,
  parseDisplayNameAndHousehold,
  parseFirstAndLastName,
  stringifyBillAddr as stringifyBillAddrHelper,
} from "@/lib/quickbooks-helpers";
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
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address?: string };
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

type QBInvoice = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { value?: string; name?: string };
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


async function geocodeAddress(address: string) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !address) return null;

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
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

/** Format timestamp for QuickBooks WHERE Metadata.LastUpdatedTime (ISO without ms). */
function toQBTime(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchQBCustomers(
  realmId: string,
  accessToken: string,
  options?: { since?: string }
) {
  const base = getQBApiBaseUrl();
  const pageSize = 100;
  let startPosition = 1;
  const customers: QBCustomer[] = [];
  const maxPages = 500; // safety cap (50k)
  const whereClause = options?.since
    ? ` where Metadata.LastUpdatedTime > '${options.since}'`
    : "";

  for (let page = 0; page < maxPages; page++) {
    const query = `select * from Customer${whereClause} startposition ${startPosition} maxresults ${pageSize}`;
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

    const pageRows = data.QueryResponse?.Customer ?? [];
    customers.push(...pageRows);

    if (pageRows.length === pageSize) {
      startPosition += pageSize;
      continue;
    }
    break;
  }

  return customers;
}

async function fetchQBSalesReceipts({
  realmId,
  accessToken,
  maxToFetch,
  since,
}: {
  realmId: string;
  accessToken: string;
  maxToFetch: number;
  since?: string;
}) {
  const base = getQBApiBaseUrl();
  const pageSize = 100;
  let startPosition = 1;
  const receipts: QBSalesReceipt[] = [];
  const maxPages = 500;
  const whereClause = since
    ? ` where Metadata.LastUpdatedTime > '${since}'`
    : "";
  const orderClause = whereClause ? " orderby Metadata.LastUpdatedTime asc" : " orderby TxnDate desc";

  for (let page = 0; page < maxPages; page++) {
    if (receipts.length >= maxToFetch) break;

    const remaining = maxToFetch - receipts.length;
    const take = Math.min(pageSize, remaining);

    const query = `select Id, TxnDate, TotalAmt, CustomerRef, PrivateNote, DocNumber from SalesReceipt${whereClause}${orderClause} startposition ${startPosition} maxresults ${take}`;
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

    const pageRows = data.QueryResponse?.SalesReceipt ?? [];
    receipts.push(...pageRows);

    if (pageRows.length === take && take === pageSize) {
      startPosition += pageSize;
      continue;
    }
    break;
  }

  return receipts.slice(0, maxToFetch);
}

/** Fetches ALL SalesReceipts for LTV (no date filter, no cap). Paginates until no more. */
async function fetchQBSalesReceiptsAllForLTV(
  realmId: string,
  accessToken: string
): Promise<QBSalesReceipt[]> {
  const base = getQBApiBaseUrl();
  const pageSize = 1000;
  let startPosition = 1;
  const receipts: QBSalesReceipt[] = [];
  const maxPages = 1000; // safety cap (1M rows)

  for (let page = 0; page < maxPages; page++) {
    const query = `select Id, TxnDate, TotalAmt, CustomerRef, PrivateNote, DocNumber from SalesReceipt startposition ${startPosition} maxresults ${pageSize}`;
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
        `QuickBooks SalesReceipt (LTV) query failed (${res.status})`,
        res.status,
        body
      );
    }

    const data = (await res.json()) as {
      QueryResponse?: { SalesReceipt?: QBSalesReceipt[] };
    };

    const pageRows = data.QueryResponse?.SalesReceipt ?? [];
    receipts.push(...pageRows);

    if (pageRows.length === pageSize) {
      startPosition += pageSize;
      continue;
    }
    break;
  }

  return receipts;
}

/** Fetches ALL Invoices for LTV. Paid amount = TotalAmt - Balance. No date filter, paginate until done. */
async function fetchQBInvoicesAllForLTV(
  realmId: string,
  accessToken: string
): Promise<QBInvoice[]> {
  const base = getQBApiBaseUrl();
  const pageSize = 1000;
  let startPosition = 1;
  const invoices: QBInvoice[] = [];
  const maxPages = 1000;

  for (let page = 0; page < maxPages; page++) {
    const query = `select Id, TxnDate, TotalAmt, Balance, CustomerRef from Invoice startposition ${startPosition} maxresults ${pageSize}`;
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
        `QuickBooks Invoice (LTV) query failed (${res.status})`,
        res.status,
        body
      );
    }

    const data = (await res.json()) as {
      QueryResponse?: { Invoice?: QBInvoice[] };
    };

    const pageRows = data.QueryResponse?.Invoice ?? [];
    invoices.push(...pageRows);

    if (pageRows.length === pageSize) {
      startPosition += pageSize;
      continue;
    }
    break;
  }

  return invoices;
}

export async function GET(request: Request) {
  let orgIdForTokenClear: string | null = null;
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

    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", auth.orgId)
      .maybeSingle();

    if (orgError) {
      return NextResponse.json(
        { error: "Org lookup failed.", details: orgError.message },
        { status: 500 }
      );
    }
    if (!org?.qb_realm_id || !org?.qb_refresh_token) {
      return NextResponse.json(
        { error: "QuickBooks not connected for your organization. Connect QuickBooks in Settings first." },
        { status: 400 }
      );
    }

    const orgId = org.id;
    orgIdForTokenClear = orgId;
    const orgRealmId = org.qb_realm_id;

    let accessToken = org.qb_access_token ?? "";
    let refreshToken = org.qb_refresh_token ?? "";

    const oauthClient = createQBOAuthClient();
    oauthClient.setToken({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    console.log("🔒 QB Config Environment:", process.env.QB_ENVIRONMENT);

    async function refreshTokens() {
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
    }

    const forceFull = url.searchParams.get("full") === "true";
    const lastSyncedAt = org?.last_synced_at ?? null;
    const isFullSync = !lastSyncedAt || forceFull;
    const sinceIso = lastSyncedAt ? toQBTime(lastSyncedAt) : undefined;

    async function fetchCustomersWithRefreshRetry() {
      try {
        if (!accessToken) await refreshTokens();
        return await fetchQBCustomers(orgRealmId, accessToken, isFullSync ? undefined : { since: sinceIso });
      } catch (e) {
        const qbErr = e instanceof QBApiError ? e : null;
        const shouldRetry =
          qbErr?.status === 401 ||
          (typeof qbErr?.body === "string" && qbErr.body.toLowerCase().includes("token"));

        if (!shouldRetry) throw e;

        await refreshTokens();
        return await fetchQBCustomers(orgRealmId, accessToken, isFullSync ? undefined : { since: sinceIso });
      }
    }

    async function fetchSalesReceiptsWithRefreshRetry() {
      try {
        if (!accessToken) await refreshTokens();
        return await fetchQBSalesReceipts({
          realmId: orgRealmId,
          accessToken,
          maxToFetch: 1000,
          since: isFullSync ? undefined : sinceIso,
        });
      } catch (e) {
        const qbErr = e instanceof QBApiError ? e : null;
        const shouldRetry =
          qbErr?.status === 401 ||
          (typeof qbErr?.body === "string" && qbErr.body.toLowerCase().includes("token"));
        if (!shouldRetry) throw e;

        await refreshTokens();
        return await fetchQBSalesReceipts({
          realmId: orgRealmId,
          accessToken,
          maxToFetch: 1000,
          since: isFullSync ? undefined : sinceIso,
        });
      }
    }

    async function fetchSalesReceiptsAllForLTVWithRefreshRetry() {
      try {
        if (!accessToken) await refreshTokens();
        return await fetchQBSalesReceiptsAllForLTV(orgRealmId, accessToken);
      } catch (e) {
        const qbErr = e instanceof QBApiError ? e : null;
        const shouldRetry =
          qbErr?.status === 401 ||
          (typeof qbErr?.body === "string" && qbErr.body.toLowerCase().includes("token"));
        if (!shouldRetry) throw e;
        await refreshTokens();
        return await fetchQBSalesReceiptsAllForLTV(orgRealmId, accessToken);
      }
    }

    async function fetchInvoicesAllForLTVWithRefreshRetry() {
      try {
        if (!accessToken) await refreshTokens();
        return await fetchQBInvoicesAllForLTV(orgRealmId, accessToken);
      } catch (e) {
        const qbErr = e instanceof QBApiError ? e : null;
        const shouldRetry =
          qbErr?.status === 401 ||
          (typeof qbErr?.body === "string" && qbErr.body.toLowerCase().includes("token"));
        if (!shouldRetry) throw e;
        await refreshTokens();
        return await fetchQBInvoicesAllForLTV(orgRealmId, accessToken);
      }
    }

    const customers = await fetchCustomersWithRefreshRetry();
    const receipts = isFullSync
      ? await fetchSalesReceiptsAllForLTVWithRefreshRetry()
      : await fetchSalesReceiptsWithRefreshRetry();
    const invoicesForLTV = isFullSync ? await fetchInvoicesAllForLTVWithRefreshRetry() : [];

    // LTV: sum SalesReceipt TotalAmt (incl. negative refunds) + Invoice paid amount (TotalAmt - Balance). No date filter; all pages fetched for full sync.
    const totalsByCustomer = new Map<string, number>();
    const lastGiftByCustomer = new Map<string, { date: string; amount: number }>();

    for (const r of receipts) {
      const qbCustomerId = r.CustomerRef?.value;
      const amount = typeof r.TotalAmt === "number" ? r.TotalAmt : null;
      const date = r.TxnDate;
      if (!qbCustomerId || amount == null || !date) continue;
      totalsByCustomer.set(qbCustomerId, (totalsByCustomer.get(qbCustomerId) ?? 0) + amount);
      const existing = lastGiftByCustomer.get(qbCustomerId);
      if (!existing || date > existing.date) {
        lastGiftByCustomer.set(qbCustomerId, { date, amount });
      }
    }

    for (const inv of invoicesForLTV) {
      const qbCustomerId = inv.CustomerRef?.value;
      const totalAmt = typeof inv.TotalAmt === "number" ? inv.TotalAmt : 0;
      const balance = typeof inv.Balance === "number" ? inv.Balance : 0;
      const paidAmt = totalAmt - balance;
      const date = inv.TxnDate;
      if (!qbCustomerId || !date) continue;
      totalsByCustomer.set(qbCustomerId, (totalsByCustomer.get(qbCustomerId) ?? 0) + paidAmt);
      const existing = lastGiftByCustomer.get(qbCustomerId);
      if (!existing || date > existing.date) {
        lastGiftByCustomer.set(qbCustomerId, { date, amount: paidAmt });
      }
    }

    // Avoid re-geocoding donors that already have coordinates. Paginate to load all org donors.
    const coordsByQbCustomerId = new Map<
      string,
      { lat: number | null; lng: number | null }
    >();
    const existingByQbCustomerId = new Map<
      string,
      {
        billing_address: string | null;
        total_lifetime_value: number | string | null;
        last_donation_amount: number | string | null;
        embedding: unknown;
      }
    >();
    const existingDonorsPageSize = 1000;
    let existingOffset = 0;
    while (true) {
      const { data: existingDonors, error: existingDonorsError } = await supabase
        .from("donors")
        .select(
          "qb_customer_id,billing_address,total_lifetime_value,last_donation_amount,embedding,location_lat,location_lng"
        )
        .eq("org_id", orgId)
        .range(existingOffset, existingOffset + existingDonorsPageSize - 1);

      if (existingDonorsError) {
        return NextResponse.json(
          { error: "Failed to load existing donors.", details: existingDonorsError.message },
          { status: 500 }
        );
      }
      const page = existingDonors ?? [];
      for (const d of page) {
        const qbId = (d as any)?.qb_customer_id as string | null | undefined;
        if (!qbId) continue;
        existingByQbCustomerId.set(qbId, {
          billing_address: (d as any)?.billing_address ?? null,
          total_lifetime_value: (d as any)?.total_lifetime_value ?? null,
          last_donation_amount: (d as any)?.last_donation_amount ?? null,
          embedding: (d as any)?.embedding ?? null,
        });
        coordsByQbCustomerId.set(qbId, {
          lat: (d as any)?.location_lat ?? null,
          lng: (d as any)?.location_lng ?? null,
        });
      }
      if (page.length < existingDonorsPageSize) break;
      existingOffset += existingDonorsPageSize;
    }

    const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
    let geocodedAttempted = 0;
    let geocodedSucceeded = 0;
    let geocodedSkippedExisting = 0;

    const embeddingInputs: string[] = [];
    const embeddingTargetIndexes: number[] = [];
    let embeddingsAttempted = 0;
    let embeddingsGenerated = 0;
    let embeddingsSkipped = 0;

    const donorsToUpsert: Array<Record<string, unknown>> = [];
    for (const c of customers) {
      const qbCustomerId = c.Id;
      if (!qbCustomerId) continue;

      const billingAddress = stringifyBillAddrHelper(c.BillAddr);
      const { city: parsedCity, state: parsedState, zip: parsedZip } =
        getCityStateZipFromBillAddr(c.BillAddr);
      const { display_name: displayName, household_greeting: householdGreeting } =
        parseDisplayNameAndHousehold(c);
      const { first_name: firstName, last_name: lastName } = parseFirstAndLastName(c, displayName ?? null);

      const total = isFullSync ? (totalsByCustomer.get(qbCustomerId) ?? 0) : 0;
      const lastGift = isFullSync ? lastGiftByCustomer.get(qbCustomerId) ?? null : null;
      const billingAddressValue = billingAddress || null;

      const payload: Record<string, unknown> = {
        org_id: orgId,
        qb_customer_id: qbCustomerId,
        display_name: displayName,
        household_greeting: householdGreeting,
        first_name: firstName,
        last_name: lastName,
        email: c.PrimaryEmailAddr?.Address ?? null,
        billing_address: billingAddressValue,
        city: parsedCity,
        state: parsedState,
        zip: parsedZip,
        total_lifetime_value: total,
        last_donation_date: lastGift?.date ?? null,
        last_donation_amount: lastGift?.amount ?? null,
      };

      // Geocode (only if we have an address and coordinates aren't already present).
      if (billingAddress) {
        const existing = coordsByQbCustomerId.get(qbCustomerId);
        const hasExistingCoords = !!(existing?.lat != null && existing?.lng != null);

        if (hasExistingCoords) {
          geocodedSkippedExisting += 1;
        } else {
          let coords = geocodeCache.get(billingAddress);
          if (coords === undefined) {
            geocodedAttempted += 1;
            coords = await geocodeAddress(billingAddress);
            geocodeCache.set(billingAddress, coords);
          }

          if (coords) {
            geocodedSucceeded += 1;
            payload.location_lat = coords.lat;
            payload.location_lng = coords.lng;
          }
        }
      }

      donorsToUpsert.push(payload);

      // Embedding generation (skip when unchanged to save credits).
      const existing = existingByQbCustomerId.get(qbCustomerId);
      const existingAddress = existing?.billing_address ?? null;
      const existingLtv = toNumber(existing?.total_lifetime_value);
      const existingHasEmbedding = existing?.embedding != null;

      const nextAddress = (payload.billing_address as string | null) ?? null;
      const nextLtv = typeof payload.total_lifetime_value === "number" ? payload.total_lifetime_value : total;

      const addressChanged = existing ? existingAddress !== nextAddress : true;
      const ltvChanged = existing ? (existingLtv ?? 0) !== nextLtv : true;
      // Incremental with 0 total: skip embedding (totals recomputed later); avoid overwriting with $0.00.
      const shouldEmbed =
        (!isFullSync && total === 0)
          ? false
          : !existing || !existingHasEmbedding || addressChanged || ltvChanged;
      if (!shouldEmbed) {
        embeddingsSkipped += 1;
        continue;
      }

      const city = parsedCity ?? "Unknown";
      const state = parsedState ?? "Unknown";
      const name = displayName ?? "Unknown";
      const email = c.PrimaryEmailAddr?.Address ?? "Unknown";

      const contextString = `${name} is a donor located in ${city}, ${state}. They have a total lifetime value of $${Number(nextLtv).toFixed(
        2
      )}. Contact email: ${email}.`;

      embeddingInputs.push(contextString);
      embeddingTargetIndexes.push(donorsToUpsert.length - 1);
    }

    // Batch-generate embeddings and attach to donor payloads.
    const batchSize = 100;
    for (let i = 0; i < embeddingInputs.length; i += batchSize) {
      const batch = embeddingInputs.slice(i, i + batchSize);
      embeddingsAttempted += batch.length;
      const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch,
      });

      const vecs = res.data?.map((x) => x.embedding) ?? [];
      for (let j = 0; j < vecs.length; j++) {
        const payloadIndex = embeddingTargetIndexes[i + j];
        const vec = vecs[j];
        if (payloadIndex == null || !vec) continue;
        donorsToUpsert[payloadIndex].embedding = vec;
        embeddingsGenerated += 1;
      }
    }

    if (donorsToUpsert.length) {
      const { error: upsertError } = await supabase
        .from("donors")
        .upsert(donorsToUpsert, { onConflict: "org_id,qb_customer_id" });

      if (upsertError) {
        return NextResponse.json(
          { error: "Failed to upsert donors.", details: upsertError.message },
          { status: 500 }
        );
      }
    }

    // Persist individual transactions to `donations` so dashboards can chart real data.
    if (receipts.length) {
      const qbIds = donorsToUpsert
        .map((d) => (typeof d.qb_customer_id === "string" ? d.qb_customer_id : null))
        .filter((x): x is string => !!x);

      const { data: donorIdRows, error: donorIdError } = await supabase
        .from("donors")
        .select("id,qb_customer_id")
        .eq("org_id", orgId)
        .in("qb_customer_id", qbIds);

      if (donorIdError) {
        return NextResponse.json(
          { error: "Failed to load donor IDs for donations.", details: donorIdError.message },
          { status: 500 }
        );
      }

      const donorIdByQbCustomerId = new Map<string, string>();
      for (const row of (donorIdRows ?? []) as any[]) {
        if (typeof row?.id === "string" && typeof row?.qb_customer_id === "string") {
          donorIdByQbCustomerId.set(row.qb_customer_id, row.id);
        }
      }

      const donationsToUpsert: Array<Record<string, unknown>> = [];
      for (const r of receipts) {
        const qbCustomerId = r.CustomerRef?.value;
        if (!qbCustomerId) continue;
        const donorId = donorIdByQbCustomerId.get(qbCustomerId);
        if (!donorId) continue;

        const amount = typeof r.TotalAmt === "number" ? r.TotalAmt : null;
        const date = r.TxnDate ?? null;
        if (amount == null || !date) continue;

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

      // Incremental: recompute total_lifetime_value and last_donation_* from donations for affected donors.
      if (!isFullSync && receipts.length > 0) {
        const qbIdsFromReceipts = [
          ...new Set(
            receipts
              .map((r) => r.CustomerRef?.value)
              .filter((x): x is string => !!x)
          ),
        ];
        const { data: donorRows } = await supabase
          .from("donors")
          .select("id,qb_customer_id")
          .eq("org_id", orgId)
          .in("qb_customer_id", qbIdsFromReceipts);

        const donorIds = ((donorRows ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
        if (donorIds.length > 0) {
          const { data: allDonations } = await supabase
            .from("donations")
            .select("donor_id,amount,date")
            .in("donor_id", donorIds);

          const totalByDonorId = new Map<string, number>();
          const lastGiftByDonorId = new Map<string, { date: string; amount: number }>();
          for (const row of (allDonations ?? []) as { donor_id: string; amount: number; date: string }[]) {
            const id = row.donor_id;
            totalByDonorId.set(id, (totalByDonorId.get(id) ?? 0) + Number(row.amount));
            const last = lastGiftByDonorId.get(id);
            if (!last || row.date > last.date) {
              lastGiftByDonorId.set(id, { date: row.date, amount: row.amount });
            }
          }

          const donorUpdates = donorIds.map((donorId) => {
            const total = totalByDonorId.get(donorId) ?? 0;
            const last = lastGiftByDonorId.get(donorId);
            return {
              id: donorId,
              total_lifetime_value: total,
              last_donation_date: last?.date ?? null,
              last_donation_amount: last?.amount ?? null,
            };
          });

          const { error: updateError } = await supabase
            .from("donors")
            .upsert(donorUpdates, { onConflict: "id" });

          if (updateError) {
            return NextResponse.json(
              { error: "Failed to update donor totals.", details: updateError.message },
              { status: 500 }
            );
          }
        }
      }
    }

    // Persist last sync time for next incremental run.
    const nowIso = new Date().toISOString();
    await supabase
      .from("organizations")
      .update({ last_synced_at: nowIso })
      .eq("id", orgId);

    const recordsProcessed = donorsToUpsert.length;
    return NextResponse.json({
      syncMode: isFullSync ? "full" : "incremental",
      recordsProcessed,
      realmId: orgRealmId,
      usedRealmId: orgRealmId,
      customersFetched: customers.length,
      salesReceiptsFetched: receipts.length,
      donorsUpserted: donorsToUpsert.length,
      geocodedAttempted,
      geocodedSucceeded,
      geocodedSkippedExisting,
      embeddingsAttempted,
      embeddingsGenerated,
      embeddingsSkipped,
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
    const isInvalidRefreshToken =
      message.includes("Refresh token is invalid") || message.includes("reconnect QuickBooks");

    if (isInvalidRefreshToken && orgIdForTokenClear) {
      const supabase = createAdminClient();
      await supabase
        .from("organizations")
        .update({
          qb_access_token: null,
          qb_refresh_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orgIdForTokenClear);
      return NextResponse.json(
        {
          error:
            "QuickBooks connection expired or was revoked. Please reconnect QuickBooks in Settings.",
          details: message,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Sync failed.", details: message },
      { status: isInvalidRefreshToken ? 401 : 500 }
    );
  }
}

