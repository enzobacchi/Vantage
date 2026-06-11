/**
 * QuickBooks write-back: push Vantage-created donations to QB as
 * SalesReceipts. v1 is push-create only — edits/deletes in Vantage do not
 * propagate (UI shows a "synced — update in QB too" notice instead).
 *
 * Idempotency / dedup design (CRITICAL — keep all three layers):
 *  1. Every pushed SalesReceipt carries PrivateNote "vantage_donation_id:<uuid>"
 *     and a DocNumber derived from the donation uuid. Pull-sync checks the
 *     PrivateNote marker and links instead of importing a duplicate.
 *  2. On success we store donations.qb_id + qb_txn_type; pull-sync also skips
 *     any receipt whose id is already linked.
 *  3. The partial unique index donations(org_id, qb_txn_type, qb_id) is the
 *     final backstop against races.
 *  Retries are made idempotent by querying QB for the deterministic DocNumber
 *  before re-posting (PrivateNote is not reliably queryable).
 */

import crypto from "crypto";

import { QBApiError, qbCreate, qbQuery, type QBTokenManager } from "@/lib/quickbooks/request";
import type { createAdminClient } from "@/lib/supabase/admin";

const VANTAGE_MARKER_PREFIX = "vantage_donation_id:";
const DONATION_ITEM_NAME = "Donation";
const MAX_PUSH_ATTEMPTS = 5;

type AdminClient = ReturnType<typeof createAdminClient>;

export type PushResult =
  | { ok: true; qbId: string }
  | { ok: false; error: string };

/** Deterministic 8-char DocNumber from the donation uuid (QB max is 21 chars). */
export function docNumberForDonation(donationId: string): string {
  return crypto.createHash("sha256").update(donationId).digest("hex").slice(0, 8).toUpperCase();
}

/** Extract a Vantage donation id from a pushed receipt's PrivateNote, if present. */
export function parseVantageMarker(privateNote: string | null | undefined): string | null {
  if (!privateNote) return null;
  const trimmed = privateNote.trim();
  if (!trimmed.startsWith(VANTAGE_MARKER_PREFIX)) return null;
  const id = trimmed.slice(VANTAGE_MARKER_PREFIX.length).split(/\s/)[0];
  return id || null;
}

/** Escape a single-quoted string literal for QB's query language. */
function qbEscape(value: string): string {
  return value.replace(/'/g, "\\'");
}

/**
 * Ensure the donor exists as a QB Customer; returns its QB id. Creates the
 * Customer when missing; on QB's duplicate-DisplayName error, adopts the
 * existing Customer instead of failing. Persists qb_customer_id on the donor.
 */
export async function ensureQBCustomer(
  supabase: AdminClient,
  realmId: string,
  tokens: QBTokenManager,
  donor: {
    id: string;
    qb_customer_id: string | null;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }
): Promise<string> {
  if (donor.qb_customer_id) return donor.qb_customer_id;

  const displayName = donor.display_name?.trim();
  if (!displayName) throw new Error("Donor has no name — cannot create QuickBooks customer.");

  let qbId: string | null = null;
  try {
    const created = await tokens.withTokenRefreshRetry(() =>
      qbCreate<{ Id?: string }>(realmId, tokens.accessToken, "Customer", {
        DisplayName: displayName,
        ...(donor.first_name ? { GivenName: donor.first_name } : {}),
        ...(donor.last_name ? { FamilyName: donor.last_name } : {}),
        ...(donor.email ? { PrimaryEmailAddr: { Address: donor.email } } : {}),
      })
    );
    qbId = created.Id ?? null;
  } catch (e) {
    // 6240 = duplicate DisplayName — adopt the existing customer
    const isDuplicate = e instanceof QBApiError && e.body.includes("6240");
    if (!isDuplicate) throw e;
    const resp = await tokens.withTokenRefreshRetry(() =>
      qbQuery<{ Id?: string }>(
        realmId,
        tokens.accessToken,
        `select Id from Customer where DisplayName = '${qbEscape(displayName)}'`
      )
    );
    qbId = resp.Customer?.[0]?.Id ?? null;
  }

  if (!qbId) throw new Error("Could not create or find QuickBooks customer.");

  await supabase.from("donors").update({ qb_customer_id: qbId }).eq("id", donor.id);
  return qbId;
}

/**
 * Ensure the org has a QB Item to put on SalesReceipt lines (QB requires
 * one). Uses the cached id, else looks up/creates a Service item named
 * "Donation" tied to the org's first Income account.
 */
export async function ensureDonationItem(
  supabase: AdminClient,
  orgId: string,
  realmId: string,
  tokens: QBTokenManager,
  cachedItemId: string | null
): Promise<string> {
  if (cachedItemId) return cachedItemId;

  // Existing item by name?
  const itemResp = await tokens.withTokenRefreshRetry(() =>
    qbQuery<{ Id?: string }>(
      realmId,
      tokens.accessToken,
      `select Id from Item where Name = '${DONATION_ITEM_NAME}'`
    )
  );
  let itemId = itemResp.Item?.[0]?.Id ?? null;

  if (!itemId) {
    // Item creation requires an income account
    const acctResp = await tokens.withTokenRefreshRetry(() =>
      qbQuery<{ Id?: string }>(
        realmId,
        tokens.accessToken,
        `select Id from Account where AccountType = 'Income'`
      )
    );
    const incomeAccountId = acctResp.Account?.[0]?.Id;
    if (!incomeAccountId) {
      throw new Error(
        "QuickBooks has no income account. Create one in QuickBooks, then retry."
      );
    }

    const created = await tokens.withTokenRefreshRetry(() =>
      qbCreate<{ Id?: string }>(realmId, tokens.accessToken, "Item", {
        Name: DONATION_ITEM_NAME,
        Type: "Service",
        IncomeAccountRef: { value: incomeAccountId },
      })
    );
    itemId = created.Id ?? null;
  }

  if (!itemId) throw new Error("Could not create or find the QuickBooks Donation item.");

  await supabase
    .from("organizations")
    .update({ qb_donation_item_id: itemId })
    .eq("id", orgId);
  return itemId;
}

/** Map Vantage payment_method values to default QB PaymentMethod names. */
const QB_PAYMENT_METHOD_NAMES: Record<string, string> = {
  check: "Check",
  cash: "Cash",
};

/**
 * Push a single donation to QB as a SalesReceipt. Caller is responsible for
 * having verified org opt-in + source != 'quickbooks'. Updates the donation
 * row with the outcome; never throws (returns PushResult).
 */
export async function pushDonationToQB(
  supabase: AdminClient,
  orgId: string,
  realmId: string,
  tokens: QBTokenManager,
  donationId: string
): Promise<PushResult> {
  const fail = async (message: string): Promise<PushResult> => {
    await supabase
      .from("donations")
      .update({ qb_sync_status: "failed", qb_sync_error: message.slice(0, 500) })
      .eq("id", donationId)
      .eq("org_id", orgId);
    return { ok: false, error: message };
  };

  try {
    const { data: donation } = await supabase
      .from("donations")
      .select(
        "id, donor_id, amount, date, memo, payment_method, source, qb_id, qb_sync_attempts, donors(id, qb_customer_id, display_name, first_name, last_name, email)"
      )
      .eq("id", donationId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!donation) return { ok: false, error: "Donation not found" };
    if (donation.qb_id) return { ok: true, qbId: donation.qb_id }; // already pushed
    if (donation.source === "quickbooks") {
      return { ok: false, error: "QB-originated donation — push skipped" };
    }

    const donor = donation.donors as unknown as {
      id: string;
      qb_customer_id: string | null;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
    if (!donor) return await fail("Donation has no donor.");

    const attempts = (donation.qb_sync_attempts as number) ?? 0;
    await supabase
      .from("donations")
      .update({ qb_sync_attempts: attempts + 1 })
      .eq("id", donationId)
      .eq("org_id", orgId);

    const docNumber = docNumberForDonation(donationId);

    // Retry idempotency: a previous attempt may have reached QB but failed to
    // record locally. DocNumber is deterministic and queryable — adopt the
    // existing receipt instead of double-posting.
    if (attempts > 0) {
      const existing = await tokens.withTokenRefreshRetry(() =>
        qbQuery<{ Id?: string }>(
          realmId,
          tokens.accessToken,
          `select Id from SalesReceipt where DocNumber = '${docNumber}'`
        )
      );
      const existingId = existing.SalesReceipt?.[0]?.Id;
      if (existingId) {
        await supabase
          .from("donations")
          .update({
            qb_id: existingId,
            qb_txn_type: "SalesReceipt",
            qb_sync_status: "synced",
            qb_sync_error: null,
            qb_synced_at: new Date().toISOString(),
          })
          .eq("id", donationId)
          .eq("org_id", orgId);
        return { ok: true, qbId: existingId };
      }
    }

    const { data: orgRow } = await supabase
      .from("organizations")
      .select("qb_donation_item_id")
      .eq("id", orgId)
      .maybeSingle();

    const customerId = await ensureQBCustomer(supabase, realmId, tokens, donor);
    const itemId = await ensureDonationItem(
      supabase,
      orgId,
      realmId,
      tokens,
      (orgRow?.qb_donation_item_id as string | null) ?? null
    );

    const amount = Number(donation.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return await fail("Donation amount is not a positive number.");
    }

    // Best-effort PaymentMethodRef for methods QB orgs have by default
    let paymentMethodRef: { value: string } | undefined;
    const qbMethodName = QB_PAYMENT_METHOD_NAMES[donation.payment_method as string];
    if (qbMethodName) {
      try {
        const pmResp = await tokens.withTokenRefreshRetry(() =>
          qbQuery<{ Id?: string }>(
            realmId,
            tokens.accessToken,
            `select Id from PaymentMethod where Name = '${qbMethodName}'`
          )
        );
        const pmId = pmResp.PaymentMethod?.[0]?.Id;
        if (pmId) paymentMethodRef = { value: pmId };
      } catch {
        // omit the ref — not worth failing the push over
      }
    }

    const created = await tokens.withTokenRefreshRetry(() =>
      qbCreate<{ Id?: string }>(realmId, tokens.accessToken, "SalesReceipt", {
        Line: [
          {
            DetailType: "SalesItemLineDetail",
            Amount: amount,
            Description: donation.memo?.slice(0, 4000) || "Donation",
            SalesItemLineDetail: {
              ItemRef: { value: itemId },
              Qty: 1,
              UnitPrice: amount,
            },
          },
        ],
        CustomerRef: { value: customerId },
        ...(donation.date ? { TxnDate: donation.date } : {}),
        DocNumber: docNumber,
        PrivateNote: `${VANTAGE_MARKER_PREFIX}${donationId}`,
        ...(paymentMethodRef ? { PaymentMethodRef: paymentMethodRef } : {}),
        // DepositToAccountRef intentionally omitted — QB defaults to
        // Undeposited Funds, the right home for a receipt awaiting deposit.
      })
    );

    const qbId = created.Id;
    if (!qbId) return await fail("QuickBooks returned no SalesReceipt id.");

    await supabase
      .from("donations")
      .update({
        qb_id: qbId,
        qb_txn_type: "SalesReceipt",
        qb_sync_status: "synced",
        qb_sync_error: null,
        qb_synced_at: new Date().toISOString(),
      })
      .eq("id", donationId)
      .eq("org_id", orgId);

    return { ok: true, qbId };
  } catch (e) {
    const message =
      e instanceof QBApiError
        ? `${e.message}: ${e.body.slice(0, 300)}`
        : e instanceof Error
          ? e.message
          : "Unknown error";
    return await fail(message);
  }
}

/**
 * Best-effort inline push for a freshly created donation. Loads the org,
 * verifies opt-in + connection, and pushes. Never throws — failures stay
 * `pending`/`failed` and the cron sweep retries them.
 */
export async function tryPushDonationInline(
  supabase: AdminClient,
  orgId: string,
  donationId: string
): Promise<void> {
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("qb_realm_id, qb_access_token, qb_refresh_token, qb_writeback_enabled")
      .eq("id", orgId)
      .maybeSingle();

    if (!org?.qb_writeback_enabled || !org.qb_realm_id || !org.qb_refresh_token) return;

    const { createQBTokenManager } = await import("@/lib/quickbooks/request");
    const tokens = createQBTokenManager(supabase, orgId, {
      accessToken: org.qb_access_token ?? "",
      refreshToken: org.qb_refresh_token,
    });
    await pushDonationToQB(supabase, orgId, org.qb_realm_id, tokens, donationId);
  } catch (e) {
    console.error(`[QB push] inline push failed for donation=${donationId}:`, e);
  }
}

/**
 * Sweep this org's pending/failed pushes (attempts < MAX). Called from the
 * sync push phase (cron + manual sync).
 */
export async function pushPendingForOrg(
  supabase: AdminClient,
  orgId: string,
  realmId: string,
  tokens: QBTokenManager
): Promise<{ pushed: number; failed: number }> {
  const { data: pending } = await supabase
    .from("donations")
    .select("id")
    .eq("org_id", orgId)
    .in("qb_sync_status", ["pending", "failed"])
    .lt("qb_sync_attempts", MAX_PUSH_ATTEMPTS)
    .order("created_at")
    .limit(100);

  let pushed = 0;
  let failed = 0;
  for (const row of (pending ?? []) as { id: string }[]) {
    const result = await pushDonationToQB(supabase, orgId, realmId, tokens, row.id);
    if (result.ok) pushed++;
    else failed++;
  }
  if (pushed || failed) {
    console.log(`[QB push] org=${orgId} pushed=${pushed} failed=${failed}`);
  }
  return { pushed, failed };
}
