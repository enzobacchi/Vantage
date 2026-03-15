import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type DonationListItem = {
  id: string;
  donor_id: string;
  donor_name: string | null;
  amount: number;
  date: string | null;
  memo: string | null;
  payment_method: string;
  category_id: string | null;
  campaign_id: string | null;
  fund_id: string | null;
  category_name: string | null;
  campaign_name: string | null;
  fund_name: string | null;
  acknowledgment_sent_at: string | null;
};

const VALID_PAYMENT_METHODS = new Set([
  "check",
  "cash",
  "zelle",
  "wire",
  "venmo",
  "other",
  "quickbooks",
  "daf",
]);

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const paymentMethod = searchParams.get("payment_method")?.trim();
  const categoryId = searchParams.get("category_id")?.trim();
  const campaignId = searchParams.get("campaign_id")?.trim();
  const fundId = searchParams.get("fund_id")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "25", 10)));

  const supabase = createAdminClient();

  const { data: orgDonors } = await supabase
    .from("donors")
    .select("id")
    .eq("org_id", auth.orgId);
  const donorIds = (orgDonors ?? []).map((d: { id: string }) => d.id);

  if (donorIds.length === 0) {
    return NextResponse.json({ donations: [], total: 0 });
  }

  let query = supabase
    .from("donations")
    .select("id,donor_id,amount,date,memo,payment_method,category_id,campaign_id,fund_id,acknowledgment_sent_at,donors(display_name)", {
      count: "exact",
    })
    .in("donor_id", donorIds)
    .order("date", { ascending: false, nullsFirst: false });

  if (paymentMethod && VALID_PAYMENT_METHODS.has(paymentMethod)) {
    query = query.eq("payment_method", paymentMethod);
  }
  if (categoryId) query = query.eq("category_id", categoryId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (fundId) query = query.eq("fund_id", fundId);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query = query.gte("date", from);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query = query.lte("date", to);
  }

  const fromRow = page * limit;
  const { data, error, count } = await query.range(fromRow, fromRow + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load donations.", details: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as Array<{
    id: string;
    donor_id: string;
    amount: number;
    date: string | null;
    memo: string | null;
    payment_method: string;
    category_id: string | null;
    campaign_id: string | null;
    fund_id: string | null;
    acknowledgment_sent_at: string | null;
    donors?: { display_name?: string | null } | null;
  }>;

  const optionIds = new Set<string>();
  rows.forEach((r) => {
    if (r.category_id) optionIds.add(r.category_id);
    if (r.campaign_id) optionIds.add(r.campaign_id);
    if (r.fund_id) optionIds.add(r.fund_id);
  });

  const optionNames: Record<string, string> = {};
  if (optionIds.size > 0) {
    const { data: options } = await supabase
      .from("org_donation_options")
      .select("id,name")
      .in("id", [...optionIds]);
    for (const o of options ?? []) {
      optionNames[o.id] = o.name ?? "";
    }
  }

  const donations: DonationListItem[] = rows.map((r) => ({
    id: r.id,
    donor_id: r.donor_id,
    donor_name:
      r.donors && typeof r.donors.display_name === "string" ? r.donors.display_name : null,
    amount: Number(r.amount) || 0,
    date: r.date,
    memo: r.memo,
    payment_method: r.payment_method || "other",
    category_id: r.category_id,
    campaign_id: r.campaign_id,
    fund_id: r.fund_id,
    category_name: r.category_id ? optionNames[r.category_id] ?? null : null,
    campaign_name: r.campaign_id ? optionNames[r.campaign_id] ?? null : null,
    fund_name: r.fund_id ? optionNames[r.fund_id] ?? null : null,
    acknowledgment_sent_at: r.acknowledgment_sent_at ?? null,
  }));

  return NextResponse.json({
    donations,
    total: count ?? donations.length,
  });
}
