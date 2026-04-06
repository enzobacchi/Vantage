import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_DONOR_TYPES = ["individual", "corporate", "school", "church"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch donor, donations, interactions, and tags in parallel
  const [donorRes, donationsRes, interactionsRes, donorTagsRes] = await Promise.all([
    supabase
      .from("donors")
      .select("*")
      .eq("id", id)
      .eq("org_id", auth.orgId)
      .maybeSingle(),
    supabase
      .from("donations")
      .select("id,amount,date,memo,payment_method,category_id,campaign_id,fund_id,acknowledgment_sent_at")
      .eq("donor_id", id)
      .eq("org_id", auth.orgId)
      .order("date", { ascending: false })
      .limit(50),
    supabase
      .from("interactions")
      .select("*")
      .eq("donor_id", id)
      .order("date", { ascending: false })
      .limit(50),
    supabase
      .from("donor_tags")
      .select("tag_id")
      .eq("donor_id", id),
  ]);

  if (donorRes.error || !donorRes.data) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  // Fetch tag details if donor has tags
  let tags: { id: string; name: string; color: string }[] = [];
  const tagIds = (donorTagsRes.data ?? []).map((r) => r.tag_id);
  if (tagIds.length > 0) {
    const { data: tagData } = await supabase
      .from("tags")
      .select("id,name,color")
      .in("id", tagIds);
    tags = (tagData ?? []) as { id: string; name: string; color: string }[];
  }

  return NextResponse.json({
    donor: donorRes.data,
    donations: donationsRes.data ?? [],
    interactions: interactionsRes.data ?? [],
    tags,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  const stringFields = [
    "display_name", "email", "phone", "billing_address", "city", "state", "zip",
    "mailing_address", "mailing_city", "mailing_state", "mailing_zip",
    "first_name", "last_name",
  ];

  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updates[field] = typeof body[field] === "string" ? body[field].trim() || null : null;
    }
  }

  if (body.donor_type !== undefined && VALID_DONOR_TYPES.includes(body.donor_type)) {
    updates.donor_type = body.donor_type;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("donors")
    .update(updates)
    .eq("id", id)
    .eq("org_id", auth.orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
