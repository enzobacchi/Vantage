import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewDonation, checkAndNotifyMilestones } from "@/lib/notifications";
import { recalcDonorTotals } from "@/lib/recalc-donor-totals";
import type { PaymentMethod } from "@/types/database";

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
  acknowledgment_sent_by: string | null;
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
  const acknowledged = searchParams.get("acknowledged")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "25", 10)));

  const supabase = createAdminClient();

  let query = supabase
    .from("donations")
    .select("id,donor_id,amount,date,memo,payment_method,category_id,campaign_id,fund_id,acknowledgment_sent_at,acknowledgment_sent_by,donors(display_name)", {
      count: "exact",
    })
    .eq("org_id", auth.orgId)
    .order("date", { ascending: false, nullsFirst: false });

  if (paymentMethod && VALID_PAYMENT_METHODS.has(paymentMethod)) {
    query = query.eq("payment_method", paymentMethod);
  }
  if (categoryId) query = query.eq("category_id", categoryId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (fundId) query = query.eq("fund_id", fundId);
  if (acknowledged === "yes") {
    query = query.not("acknowledgment_sent_at", "is", null);
  } else if (acknowledged === "no") {
    query = query.is("acknowledgment_sent_at", null);
  }
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
      { error: "Failed to load donations." },
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
    acknowledgment_sent_by: string | null;
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
    const ids = [...optionIds];
    const [cats, camps, funds] = await Promise.all([
      supabase.from("gift_categories").select("id,name").in("id", ids),
      supabase.from("gift_campaigns").select("id,name").in("id", ids),
      supabase.from("gift_funds").select("id,name").in("id", ids),
    ]);
    for (const o of [...(cats.data ?? []), ...(camps.data ?? []), ...(funds.data ?? [])]) {
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
    acknowledgment_sent_by: r.acknowledgment_sent_by ?? null,
  }));

  return NextResponse.json({
    donations,
    total: count ?? donations.length,
  });
}

const PAYMENT_METHODS: PaymentMethod[] = ["check", "cash", "zelle", "wire", "venmo", "other", "quickbooks"];

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const body = await request.json();

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  const dateStr = typeof body.date === "string" ? body.date.trim() : "";
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "Date must be in YYYY-MM-DD format" }, { status: 400 });
  }

  if (!PAYMENT_METHODS.includes(body.payment_method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify donor belongs to org
  const { data: donor } = await supabase
    .from("donors")
    .select("id, display_name, total_lifetime_value")
    .eq("id", body.donor_id)
    .eq("org_id", auth.orgId)
    .maybeSingle();

  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const previousTotal = Number(donor.total_lifetime_value ?? 0);

  const { data: donation, error } = await supabase
    .from("donations")
    .insert({
      org_id: auth.orgId,
      donor_id: body.donor_id,
      amount,
      date: dateStr,
      memo: body.memo?.trim() || null,
      payment_method: body.payment_method,
      category_id: body.category_id || null,
      campaign_id: body.campaign_id || null,
      fund_id: body.fund_id || null,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[donations] POST:", error.message);
    return NextResponse.json({ error: "Failed to create donation." }, { status: 500 });
  }

  // Recalculate donor totals
  await recalcDonorTotals(supabase, body.donor_id);

  // Fire-and-forget notifications
  const donorName = (donor.display_name as string) || "Unknown Donor";
  const newTotal = previousTotal + amount;
  void notifyNewDonation(auth.orgId, donorName, amount, body.donor_id).catch(console.error);
  void checkAndNotifyMilestones(auth.orgId, body.donor_id, donorName, previousTotal, newTotal).catch(console.error);

  return NextResponse.json({ id: donation.id }, { status: 201 });
}
