/**
 * Core QB sync logic extracted from /api/sync route.
 * Can be called from:
 *   - The user-facing /api/sync route (with user session)
 *   - The cron /api/cron/sync route (no user session, iterates all orgs)
 */

import {
  getCityStateZipFromBillAddr,
  parseDisplayNameAndHousehold,
  parseFirstAndLastName,
  stringifyBillAddr as stringifyBillAddrHelper,
} from "@/lib/quickbooks-helpers";
import { getQBApiBaseUrl } from "@/lib/quickbooks/client";
import { QBApiError, createQBTokenManager } from "@/lib/quickbooks/request";
import { decryptQbToken } from "@/lib/quickbooks/token-crypto";
import { parseVantageMarker, pushPendingForOrg } from "@/lib/quickbooks/writeback";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode";
import { ABSOLUTE_DONOR_CEILING, getOrgSubscription, resolveTrialLimits } from "@/lib/subscription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncResult = {
  syncMode: "full" | "incremental";
  recordsProcessed: number;
  realmId: string;
  usedRealmId: string;
  customersFetched: number;
  salesReceiptsFetched: number;
  invoicesFetched: number;
  donorsUpserted: number;
  donorsSkippedLimit: number;
  /** True when the plan's donor cap was hit and some QB customers were not imported. */
  capReached: boolean;
  /** Effective donor cap that was applied (plan cap or ABSOLUTE_DONOR_CEILING, whichever is lower). */
  planMaxDonors: number;
  donationsUpserted: number;
  geocodedAttempted: number;
  geocodedSucceeded: number;
  geocodedSkippedExisting: number;
};

export type SyncError = {
  error: string;
  details?: string;
  status: number;
  /** True when the QB connection is invalid and tokens were cleared. */
  tokenCleared?: boolean;
};

type QBCustomer = {
  Id?: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string; DisplayForm?: string };
  AlternatePhone?: { FreeFormNumber?: string; DisplayForm?: string };
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
  ShipAddr?: {
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

type QBSalesReceiptLine = {
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value?: string; name?: string };
    ClassRef?: { value?: string; name?: string };
  };
};

type QBSalesReceipt = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number;
  CustomerRef?: { value?: string; name?: string };
  PaymentMethodRef?: { value?: string; name?: string };
  PrivateNote?: string;
  DocNumber?: string;
  Line?: QBSalesReceiptLine[];
};

type QBInvoice = {
  Id?: string;
  TxnDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { value?: string; name?: string };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPhoneFromQBCustomer(
  c: QBCustomer & Record<string, unknown>
): string | null {
  const raw = c as Record<string, unknown>;
  const tryPhone = (val: unknown): string | null => {
    if (val == null) return null;
    if (typeof val === "string" && val.trim() !== "") return val.trim();
    if (typeof val === "object" && val !== null) {
      const o = val as Record<string, unknown>;
      const v = (o.FreeFormNumber ??
        o.freeFormNumber ??
        o.DisplayForm ??
        o.displayForm) as string | undefined;
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };
  const primary =
    c.PrimaryPhone ?? raw.PrimaryPhone ?? raw.primaryPhone ?? raw.primary_phone;
  const out = tryPhone(primary);
  if (out) return out;
  const alt =
    c.AlternatePhone ??
    raw.AlternatePhone ??
    raw.alternatePhone ??
    raw.alternate_phone;
  return tryPhone(alt);
}

function toQBTime(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Safely parse a QB amount that may arrive as a number or string. */
function parseAmount(val: unknown): number | null {
  if (val == null) return null;
  const n = typeof val === "number" ? val : Number(val);
  return isNaN(n) ? null : n;
}

/** Map QB PaymentMethodRef.name to our payment_method enum values. */
function normalizePaymentMethod(qbMethod: string | null | undefined): string {
  if (!qbMethod) return "quickbooks";
  const lower = qbMethod.toLowerCase().trim();
  if (lower.includes("credit") || lower.includes("visa") || lower.includes("mastercard") || lower.includes("amex") || lower.includes("discover")) return "credit_card";
  if (lower.includes("debit")) return "debit_card";
  if (lower === "check" || lower.includes("cheque")) return "check";
  if (lower === "cash") return "cash";
  if (lower.includes("zelle")) return "zelle";
  if (lower.includes("venmo")) return "venmo";
  if (lower.includes("paypal")) return "paypal";
  if (lower.includes("wire")) return "wire";
  if (lower.includes("ach") || lower.includes("direct deposit") || lower.includes("eft")) return "ach";
  if (lower.includes("bank") || lower.includes("transfer")) return "bank_transfer";
  if (lower.includes("online") || lower.includes("stripe")) return "online";
  if (lower.includes("daf") || lower.includes("donor advised")) return "daf";
  return "other";
}

/**
 * Extract the donor's fund/designation from a QB Sales Receipt.
 * QuickBooks records the chosen fund as the Product/Service item on each
 * line (or, less commonly, a Class). For multi-line receipts we treat the
 * largest line as the primary fund. Returns null when no nameable item exists.
 */
function extractFundName(receipt: QBSalesReceipt): string | null {
  const lines = (receipt.Line ?? []).filter(
    (l) => l?.DetailType === "SalesItemLineDetail" && l.SalesItemLineDetail
  );
  let best: { name: string; amount: number } | null = null;
  for (const l of lines) {
    const detail = l.SalesItemLineDetail!;
    const name =
      detail.ItemRef?.name?.trim() || detail.ClassRef?.name?.trim() || "";
    if (!name) continue;
    const amount = parseAmount(l.Amount) ?? 0;
    if (!best || amount > best.amount) best = { name, amount };
  }
  return best?.name ?? null;
}

// ---------------------------------------------------------------------------
// QB API fetch helpers
// ---------------------------------------------------------------------------

async function fetchQBCustomers(
  realmId: string,
  accessToken: string,
  options?: { since?: string }
) {
  const base = getQBApiBaseUrl();
  const pageSize = 100;
  let startPosition = 1;
  const customers: QBCustomer[] = [];
  const maxPages = 500;
  const whereClause = options?.since
    ? ` where Metadata.LastUpdatedTime > '${options.since}'`
    : "";

  for (let page = 0; page < maxPages; page++) {
    const query = `select * from Customer${whereClause} startposition ${startPosition} maxresults ${pageSize}`;
    const endpoint = new URL(
      `${base}/v3/company/${encodeURIComponent(realmId)}/query`
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
  const orderClause = whereClause
    ? " orderby Metadata.LastUpdatedTime asc"
    : " orderby TxnDate desc";

  for (let page = 0; page < maxPages; page++) {
    if (receipts.length >= maxToFetch) break;

    const remaining = maxToFetch - receipts.length;
    const take = Math.min(pageSize, remaining);

    const query = `select * from SalesReceipt${whereClause}${orderClause} startposition ${startPosition} maxresults ${take}`;
    const endpoint = new URL(
      `${base}/v3/company/${encodeURIComponent(realmId)}/query`
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

async function fetchQBSalesReceiptsAllForLTV(
  realmId: string,
  accessToken: string
): Promise<QBSalesReceipt[]> {
  const base = getQBApiBaseUrl();
  const pageSize = 1000;
  let startPosition = 1;
  const receipts: QBSalesReceipt[] = [];
  const maxPages = 1000;

  for (let page = 0; page < maxPages; page++) {
    const query = `select * from SalesReceipt startposition ${startPosition} maxresults ${pageSize}`;
    const endpoint = new URL(
      `${base}/v3/company/${encodeURIComponent(realmId)}/query`
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

async function fetchQBInvoices(
  realmId: string,
  accessToken: string,
  options?: { since?: string }
): Promise<QBInvoice[]> {
  const base = getQBApiBaseUrl();
  const pageSize = 1000;
  let startPosition = 1;
  const invoices: QBInvoice[] = [];
  const maxPages = 1000;
  const whereClause = options?.since
    ? ` where Metadata.LastUpdatedTime > '${options.since}'`
    : "";

  for (let page = 0; page < maxPages; page++) {
    const query = `select Id, TxnDate, TotalAmt, Balance, CustomerRef from Invoice${whereClause} startposition ${startPosition} maxresults ${pageSize}`;
    const endpoint = new URL(
      `${base}/v3/company/${encodeURIComponent(realmId)}/query`
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

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Run a QB sync for a single org. Callable without a user session.
 * Returns a SyncResult on success or a SyncError on failure.
 */
export async function runSyncForOrg(
  orgId: string,
  options?: { full?: boolean }
): Promise<SyncResult | SyncError> {
  const supabase = createAdminClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) {
    return { error: "Org lookup failed.", status: 500 };
  }
  if (!org?.qb_realm_id || !org?.qb_refresh_token) {
    return {
      error:
        "QuickBooks not connected for your organization. Connect QuickBooks in Settings first.",
      status: 400,
    };
  }

  const orgRealmId = org.qb_realm_id;

  const tokens = createQBTokenManager(supabase, orgId, {
    accessToken: decryptQbToken(org.qb_access_token) ?? "",
    refreshToken: decryptQbToken(org.qb_refresh_token) ?? "",
  });
  const withTokenRefreshRetry = tokens.withTokenRefreshRetry;

  console.log(
    `[Sync] org=${orgId} realm=${orgRealmId} env=${process.env.QB_ENVIRONMENT} hasAccessToken=${!!tokens.accessToken} hasRefreshToken=${!!tokens.refreshToken}`
  );

  try {
    // --- Push phase: write-back pending Vantage donations BEFORE pulling, so
    // this run's pull immediately sees and links its own pushes. Push failure
    // never blocks the pull.
    if (org.qb_writeback_enabled) {
      try {
        await pushPendingForOrg(supabase, orgId, orgRealmId, tokens);
      } catch (e) {
        console.error(`[Sync] org=${orgId} push phase failed:`, e);
      }
    }

    const forceFull = options?.full ?? false;
    const lastSyncedAt = org?.last_synced_at ?? null;
    const isFullSync = !lastSyncedAt || forceFull;
    // Subtract 5 minutes from last_synced_at to create an overlap window.
    // This prevents missing records due to clock skew between our server and
    // QuickBooks, or transactions created during the previous sync. The upsert
    // on (donor_id, memo) deduplicates any records fetched twice.
    const sinceDate = lastSyncedAt ? new Date(new Date(lastSyncedAt).getTime() - 5 * 60 * 1000) : undefined;
    const sinceIso = sinceDate ? toQBTime(sinceDate) : undefined;

    // Fetch QB data
    const customers = await withTokenRefreshRetry(() =>
      fetchQBCustomers(
        orgRealmId,
        tokens.accessToken,
        isFullSync ? undefined : { since: sinceIso }
      )
    );

    const receipts = isFullSync
      ? await withTokenRefreshRetry(() =>
          fetchQBSalesReceiptsAllForLTV(orgRealmId, tokens.accessToken)
        )
      : await withTokenRefreshRetry(() =>
          fetchQBSalesReceipts({
            realmId: orgRealmId,
            accessToken: tokens.accessToken,
            maxToFetch: 1000,
            since: sinceIso,
          })
        );

    const invoices = await withTokenRefreshRetry(() =>
      fetchQBInvoices(
        orgRealmId,
        tokens.accessToken,
        isFullSync ? undefined : { since: sinceIso }
      )
    );

    // --- Load existing donors for geocode skip logic ---
    const coordsByQbCustomerId = new Map<
      string,
      { lat: number | null; lng: number | null }
    >();
    const existingDonorsPageSize = 1000;
    let existingOffset = 0;
    while (true) {
      const { data: existingDonors, error: existingDonorsError } =
        await supabase
          .from("donors")
          .select(
            "qb_customer_id,billing_address,total_lifetime_value,last_donation_amount,embedding,location_lat,location_lng"
          )
          .eq("org_id", orgId)
          .range(existingOffset, existingOffset + existingDonorsPageSize - 1);

      if (existingDonorsError) {
        return { error: "Failed to load existing donors.", status: 500 };
      }
      const page = existingDonors ?? [];
      for (const d of page) {
        const qbId = (d as Record<string, unknown>)
          ?.qb_customer_id as string | null | undefined;
        if (!qbId) continue;
        coordsByQbCustomerId.set(qbId, {
          lat: (d as Record<string, unknown>)?.location_lat as number | null,
          lng: (d as Record<string, unknown>)?.location_lng as number | null,
        });
      }
      if (page.length < existingDonorsPageSize) break;
      existingOffset += existingDonorsPageSize;
    }

    // --- Build donor payloads ---
    const geocodeCache = new Map<
      string,
      { lat: number; lng: number } | null
    >();
    let geocodedAttempted = 0;
    let geocodedSucceeded = 0;
    let geocodedSkippedExisting = 0;

    const donorsToUpsert: Array<Record<string, unknown>> = [];
    for (const c of customers) {
      const qbCustomerId = c.Id;
      if (!qbCustomerId) continue;

      const billingAddress = stringifyBillAddrHelper(c.BillAddr);
      const {
        city: parsedCity,
        state: parsedState,
        zip: parsedZip,
      } = getCityStateZipFromBillAddr(c.BillAddr);
      const mailingAddress = stringifyBillAddrHelper(c.ShipAddr);
      const {
        city: mailingCity,
        state: mailingState,
        zip: mailingZip,
      } = getCityStateZipFromBillAddr(c.ShipAddr);
      const {
        display_name: displayName,
        household_greeting: householdGreeting,
      } = parseDisplayNameAndHousehold(c);
      const { first_name: firstName, last_name: lastName } =
        parseFirstAndLastName(c, displayName ?? null);

      const payload: Record<string, unknown> = {
        org_id: orgId,
        qb_customer_id: qbCustomerId,
        display_name: displayName,
        household_greeting: householdGreeting,
        first_name: firstName,
        last_name: lastName,
        email: c.PrimaryEmailAddr?.Address ?? null,
        phone: getPhoneFromQBCustomer(c),
        billing_address: billingAddress || null,
        city: parsedCity,
        state: parsedState,
        zip: parsedZip,
        mailing_address: mailingAddress || null,
        mailing_city: mailingCity,
        mailing_state: mailingState,
        mailing_zip: mailingZip,
      };

      // Geocode (only if address exists and no existing coordinates)
      if (billingAddress) {
        const existing = coordsByQbCustomerId.get(qbCustomerId);
        const hasExistingCoords = !!(
          existing?.lat != null && existing?.lng != null
        );

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
    }

    // --- Enforce donor limit before upserting ---
    // Split into updates (existing QB donors) and net-new inserts
    const existingUpdates = donorsToUpsert.filter(
      (d) => coordsByQbCustomerId.has(d.qb_customer_id as string)
    );
    const netNewDonors = donorsToUpsert.filter(
      (d) => !coordsByQbCustomerId.has(d.qb_customer_id as string)
    );

    const sub = await getOrgSubscription(orgId);
    const plan = resolveTrialLimits(sub.planId, sub.trialTier);
    const { count: currentDonorCount } = await supabase
      .from("donors")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    // Effective cap: plan cap clipped to ABSOLUTE_DONOR_CEILING (10k). Ensures
    // even Pro trials stay inside the Vercel 60s sync window and runaway QB
    // accounts with 50k+ customers don't crash mid-sync.
    const effectiveCap = plan.maxDonors === 0 ? ABSOLUTE_DONOR_CEILING : Math.min(plan.maxDonors, ABSOLUTE_DONOR_CEILING);
    const slotsRemaining = Math.max(0, effectiveCap - (currentDonorCount ?? 0));
    const allowedNew = netNewDonors.slice(0, Math.min(netNewDonors.length, slotsRemaining));
    const skippedCount = netNewDonors.length - allowedNew.length;

    const finalUpsertBatch = [...existingUpdates, ...allowedNew];

    // --- Upsert donors ---
    if (finalUpsertBatch.length) {
      const { error: upsertError } = await supabase
        .from("donors")
        .upsert(finalUpsertBatch, { onConflict: "org_id,qb_customer_id" });

      if (upsertError) {
        console.error("[Sync] donors upsert error:", upsertError.message, upsertError.details);
        return { error: `Failed to upsert donors: ${upsertError.message}`, status: 500 };
      }
    }

    // --- Upsert donations from receipts & invoices ---
    let donationsUpsertedCount = 0;

    if (receipts.length || invoices.length) {
      // Broad lookup: ALL org donors with a QB customer ID (not just current batch)
      const donorIdByQbCustomerId = new Map<string, string>();
      let donorLookupOffset = 0;
      const donorLookupPageSize = 1000;
      while (true) {
        const { data: donorIdRows, error: donorIdError } = await supabase
          .from("donors")
          .select("id,qb_customer_id")
          .eq("org_id", orgId)
          .not("qb_customer_id", "is", null)
          .range(donorLookupOffset, donorLookupOffset + donorLookupPageSize - 1);

        if (donorIdError) {
          return {
            error: "Failed to load donor IDs for donations.",
            status: 500,
          };
        }

        const page = (donorIdRows ?? []) as Array<{
          id: string;
          qb_customer_id: string;
        }>;
        for (const row of page) {
          if (row?.id && row?.qb_customer_id) {
            donorIdByQbCustomerId.set(row.qb_customer_id, row.id);
          }
        }
        if (page.length < donorLookupPageSize) break;
        donorLookupOffset += donorLookupPageSize;
      }

      // --- Write-back dedup pre-pass (CRITICAL) ---
      // Receipts we pushed FROM Vantage come back in this pull. Without these
      // checks the (donor_id, memo) upsert would import each pushed receipt
      // as a second donation row (its memo is user content, not the
      // qb_sales_receipt_id:<id> encoding).
      //
      // 1. PrivateNote marker "vantage_donation_id:<uuid>" → link/skip.
      // 2. Receipt id already linked on a donation (qb_id) → skip.
      // 3. Otherwise: genuine QB-originated receipt → import as before.
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const markerByReceiptId = new Map<string, string>();
      for (const r of receipts) {
        const marker = parseVantageMarker(r.PrivateNote);
        if (marker && UUID_RE.test(marker) && r.Id) {
          markerByReceiptId.set(r.Id, marker);
        }
      }

      // Donations referenced by markers (batched lookup, org-scoped)
      const markerDonations = new Map<string, { qb_id: string | null }>();
      const markerIds = Array.from(new Set(markerByReceiptId.values()));
      for (let i = 0; i < markerIds.length; i += 100) {
        const { data: rows } = await supabase
          .from("donations")
          .select("id, qb_id")
          .eq("org_id", orgId)
          .in("id", markerIds.slice(i, i + 100));
        for (const row of (rows ?? []) as { id: string; qb_id: string | null }[]) {
          markerDonations.set(row.id, { qb_id: row.qb_id });
        }
      }

      // Receipt ids linked to a VANTAGE-pushed donation (source != quickbooks)
      // via qb_id. Only those are skipped — QB-originated rows must still
      // flow through the memo upsert so QB-side edits keep propagating.
      const linkedReceiptIds = new Set<string>();
      const receiptIds = receipts.map((r) => r.Id).filter((id): id is string => !!id);
      for (let i = 0; i < receiptIds.length; i += 100) {
        const { data: rows } = await supabase
          .from("donations")
          .select("qb_id, source")
          .eq("org_id", orgId)
          .eq("qb_txn_type", "SalesReceipt")
          .in("qb_id", receiptIds.slice(i, i + 100));
        for (const row of (rows ?? []) as { qb_id: string | null; source: string }[]) {
          if (row.qb_id && row.source !== "quickbooks") linkedReceiptIds.add(row.qb_id);
        }
      }

      // --- Resolve fund designations from receipt line items ---
      // QuickBooks stores the donor's chosen fund as the Product/Service item
      // (or Class) on each receipt line. Map those names to
      // org_donation_options(type='fund') so designations flow into Vantage,
      // auto-creating any fund the org hasn't defined yet — so a new fund on
      // the donation form just works without manual setup first.
      const fundIdByName = new Map<string, string>(); // lower(name) -> option id
      {
        const { data: existingFunds } = await supabase
          .from("org_donation_options")
          .select("id, name")
          .eq("org_id", orgId)
          .eq("type", "fund");
        for (const o of (existingFunds ?? []) as { id: string; name: string }[]) {
          fundIdByName.set(o.name.toLowerCase().trim(), o.id);
        }

        // Distinct fund names seen on these receipts but not yet defined.
        const newFundNames = new Map<string, string>(); // lower(name) -> original
        for (const r of receipts) {
          const fundName = extractFundName(r);
          if (!fundName) continue;
          const key = fundName.toLowerCase().trim();
          if (!fundIdByName.has(key) && !newFundNames.has(key)) {
            newFundNames.set(key, fundName);
          }
        }

        if (newFundNames.size > 0) {
          // Insert new funds; tolerate races with a concurrent sync (the
          // (org_id, type, lower(name)) unique index may reject duplicates).
          await supabase.from("org_donation_options").insert(
            Array.from(newFundNames.values()).map((name) => ({
              org_id: orgId,
              type: "fund",
              name,
            }))
          );
          // Re-read so the map reflects what actually exists, regardless of
          // which rows this sync vs. a concurrent one created.
          const { data: allFunds } = await supabase
            .from("org_donation_options")
            .select("id, name")
            .eq("org_id", orgId)
            .eq("type", "fund");
          fundIdByName.clear();
          for (const o of (allFunds ?? []) as { id: string; name: string }[]) {
            fundIdByName.set(o.name.toLowerCase().trim(), o.id);
          }
        }
      }

      // Build donation records from receipts
      const donationsToUpsert: Array<Record<string, unknown>> = [];
      for (const r of receipts) {
        const qbCustomerId = r.CustomerRef?.value;
        if (!qbCustomerId) continue;
        const donorId = donorIdByQbCustomerId.get(qbCustomerId);
        if (!donorId) continue;

        const amount = parseAmount(r.TotalAmt);
        const date = r.TxnDate ?? null;
        if (amount == null || !date) continue;

        const receiptId = r.Id ?? "";

        // 1. Vantage-pushed receipt (PrivateNote marker)
        const markerId = markerByReceiptId.get(receiptId);
        if (markerId) {
          const linked = markerDonations.get(markerId);
          if (linked && !linked.qb_id && receiptId) {
            // Crash-recovery: push reached QB but the local link write
            // failed — link it now instead of importing a duplicate.
            await supabase
              .from("donations")
              .update({
                qb_id: receiptId,
                qb_txn_type: "SalesReceipt",
                qb_sync_status: "synced",
                qb_sync_error: null,
                qb_synced_at: new Date().toISOString(),
              })
              .eq("id", markerId)
              .eq("org_id", orgId);
          }
          // Linked, just-linked, or deleted in Vantage — never re-import.
          continue;
        }

        // 2. Already linked by qb_id (marker edited/stripped in QB)
        if (receiptId && linkedReceiptIds.has(receiptId)) continue;

        // 3. Genuine QB-originated receipt.
        // Use only the QB receipt ID as the dedup key — PrivateNote and
        // DocNumber are mutable fields whose changes would create duplicate
        // donation rows on re-sync.
        const memo = `qb_sales_receipt_id:${receiptId}`;

        const fundName = extractFundName(r);
        const fundId = fundName
          ? fundIdByName.get(fundName.toLowerCase().trim()) ?? null
          : null;

        donationsToUpsert.push({
          org_id: orgId,
          donor_id: donorId,
          amount,
          date,
          memo,
          payment_method: normalizePaymentMethod(r.PaymentMethodRef?.name),
          source: "quickbooks",
          qb_id: receiptId || null,
          qb_txn_type: receiptId ? "SalesReceipt" : null,
          fund_id: fundId,
        });
      }

      // Build donation records from paid invoices
      for (const inv of invoices) {
        const qbCustomerId = inv.CustomerRef?.value;
        if (!qbCustomerId) continue;
        const donorId = donorIdByQbCustomerId.get(qbCustomerId);
        if (!donorId) continue;

        const totalAmt = parseAmount(inv.TotalAmt) ?? 0;
        const balance = parseAmount(inv.Balance) ?? 0;
        const paidAmt = totalAmt - balance;
        const date = inv.TxnDate ?? null;
        if (paidAmt <= 0 || !date) continue;

        const invoiceId = inv.Id ?? "";
        const memo = `qb_invoice_id:${invoiceId}`;

        donationsToUpsert.push({
          org_id: orgId,
          donor_id: donorId,
          amount: paidAmt,
          date,
          memo,
          payment_method: "quickbooks",
          source: "quickbooks",
          qb_id: invoiceId || null,
          qb_txn_type: invoiceId ? "Invoice" : null,
        });
      }

      donationsUpsertedCount = donationsToUpsert.length;

      // Chunk donation upserts to avoid large payloads
      const DONATION_UPSERT_CHUNK = 200;
      for (let i = 0; i < donationsToUpsert.length; i += DONATION_UPSERT_CHUNK) {
        const batch = donationsToUpsert.slice(i, i + DONATION_UPSERT_CHUNK);
        const { error: donationsError } = await supabase
          .from("donations")
          .upsert(batch, { onConflict: "donor_id,memo" });

        if (donationsError) {
          console.error("[Sync] donations upsert error:", donationsError.message, donationsError.details);
          return { error: `Failed to upsert donations: ${donationsError.message}`, status: 500 };
        }
      }

      // Recompute donor totals from the donations table (always, not just incremental)
      const affectedQbIds = new Set<string>();
      for (const r of receipts) {
        if (r.CustomerRef?.value) affectedQbIds.add(r.CustomerRef.value);
      }
      for (const inv of invoices) {
        if (inv.CustomerRef?.value) affectedQbIds.add(inv.CustomerRef.value);
      }

      const affectedDonorIds = [...affectedQbIds]
        .map((qbId) => donorIdByQbCustomerId.get(qbId))
        .filter((id): id is string => !!id);

      if (affectedDonorIds.length > 0) {
        // Chunk donor IDs to keep PostgREST URL size manageable and
        // paginate within each chunk to avoid the 1000-row default limit.
        const DONOR_CHUNK = 100;
        const DONATION_PAGE = 1000;
        const totalByDonorId = new Map<string, number>();
        const lastGiftByDonorId = new Map<
          string,
          { date: string; amount: number }
        >();

        for (let ci = 0; ci < affectedDonorIds.length; ci += DONOR_CHUNK) {
          const chunk = affectedDonorIds.slice(ci, ci + DONOR_CHUNK);
          let offset = 0;

          while (true) {
            const { data: donationPage } = await supabase
              .from("donations")
              .select("donor_id,amount,date")
              .in("donor_id", chunk)
              .range(offset, offset + DONATION_PAGE - 1);

            const rows = (donationPage ?? []) as {
              donor_id: string;
              amount: number;
              date: string;
            }[];

            for (const row of rows) {
              const id = row.donor_id;
              totalByDonorId.set(
                id,
                (totalByDonorId.get(id) ?? 0) + Number(row.amount)
              );
              const last = lastGiftByDonorId.get(id);
              if (!last || row.date > last.date) {
                lastGiftByDonorId.set(id, {
                  date: row.date,
                  amount: Number(row.amount),
                });
              }
            }

            if (rows.length < DONATION_PAGE) break;
            offset += DONATION_PAGE;
          }
        }

        // Chunk the donor total updates too
        const DONOR_UPDATE_CHUNK = 100;
        for (let i = 0; i < affectedDonorIds.length; i += DONOR_UPDATE_CHUNK) {
          const batch = affectedDonorIds.slice(i, i + DONOR_UPDATE_CHUNK);
          const donorUpdates = batch.map((donorId) => {
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
            return { error: "Failed to update donor totals.", status: 500 };
          }
        }
      }
    }

    // --- Persist last sync time; clear any prior connection-health flag ---
    const nowIso = new Date().toISOString();
    await supabase
      .from("organizations")
      .update({
        last_synced_at: nowIso,
        qb_needs_reconnect: false,
        qb_last_sync_error: null,
      })
      .eq("id", orgId);

    return {
      syncMode: isFullSync ? "full" : "incremental",
      recordsProcessed: donorsToUpsert.length,
      realmId: orgRealmId,
      usedRealmId: orgRealmId,
      customersFetched: customers.length,
      salesReceiptsFetched: receipts.length,
      invoicesFetched: invoices.length,
      donorsUpserted: finalUpsertBatch.length,
      donorsSkippedLimit: skippedCount,
      capReached: skippedCount > 0,
      planMaxDonors: effectiveCap,
      donationsUpserted: donationsUpsertedCount,
      geocodedAttempted,
      geocodedSucceeded,
      geocodedSkippedExisting,
    };
  } catch (e) {
    if (e instanceof QBApiError) {
      console.error("[Sync] QB API error:", e.message, e.status, e.body);

      // A 401 / AuthorizationFault that survives the token-refresh retry means
      // Intuit has revoked the realm's grant — refresh may still succeed while
      // every query is denied, so tokens are never cleared. Flag the org so the
      // UI can prompt a reconnect instead of falsely showing "Connected".
      const body = e.body ?? "";
      const looksLikeAuthFailure =
        e.status === 401 ||
        /AuthorizationFailure|AuthenticationFailed|AuthorizationFault/i.test(body);
      if (looksLikeAuthFailure) {
        await supabase
          .from("organizations")
          .update({
            qb_needs_reconnect: true,
            qb_last_sync_error: e.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", orgId);
      }

      return { error: "Sync failed (QuickBooks API error).", status: 502 };
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    const isInvalidRefreshToken =
      message.includes("Refresh token is invalid") ||
      message.includes("reconnect QuickBooks");

    if (isInvalidRefreshToken) {
      // Re-read from DB: another sync may have already refreshed successfully.
      // Only clear tokens if the DB still has our same stale token (or null).
      const { data: currentOrg } = await supabase
        .from("organizations")
        .select("qb_refresh_token")
        .eq("id", orgId)
        .maybeSingle();

      if (
        !currentOrg?.qb_refresh_token ||
        decryptQbToken(currentOrg.qb_refresh_token) === tokens.refreshToken
      ) {
        await supabase
          .from("organizations")
          .update({
            qb_access_token: null,
            qb_refresh_token: null,
            qb_needs_reconnect: true,
            qb_last_sync_error:
              "QuickBooks connection expired or was revoked. Please reconnect QuickBooks in Settings.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orgId);

        return {
          error:
            "QuickBooks connection expired or was revoked. Please reconnect QuickBooks in Settings.",
          details: message,
          status: 401,
          tokenCleared: true,
        };
      }

      // Another process saved valid tokens — don't nuke them
      console.warn(
        `[Sync] org=${orgId} refresh token conflict — another process saved newer tokens`
      );
      return {
        error: "Sync encountered a token conflict. Please try again.",
        details: message,
        status: 409,
      };
    }

    return { error: "Sync failed.", details: message, status: 500 };
  }
}

/** Type guard to check if a sync result is an error. */
export function isSyncError(
  result: SyncResult | SyncError
): result is SyncError {
  return "error" in result;
}
