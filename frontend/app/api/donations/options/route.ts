import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_TYPES = ["category", "campaign", "fund"] as const;
type OptionType = (typeof VALID_TYPES)[number];

export type OrgDonationOption = {
  id: string;
  org_id: string;
  type: OptionType;
  name: string;
  sort_order: number;
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as OptionType | null;

  const supabase = createAdminClient();
  let query = supabase
    .from("org_donation_options")
    .select("id,org_id,type,name,sort_order")
    .eq("org_id", auth.orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (type && VALID_TYPES.includes(type)) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[donations/options] GET:", error.message);
    return NextResponse.json(
      { error: "Failed to load options." },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as OrgDonationOption[]);
}

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  let body: { type?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.type !== "string" || !VALID_TYPES.includes(body.type as OptionType)) {
    return NextResponse.json(
      { error: "type must be one of: category, campaign, fund." },
      { status: 400 }
    );
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const type = body.type as OptionType;
  const name = body.name.trim();

  const supabase = createAdminClient();

  const { data: maxOrder } = await supabase
    .from("org_donation_options")
    .select("sort_order")
    .eq("org_id", auth.orgId)
    .eq("type", type)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder =
    ((maxOrder as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("org_donation_options")
    .insert({ org_id: auth.orgId, type, name, sort_order: sortOrder })
    .select("id,org_id,type,name,sort_order")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An option with this name already exists." },
        { status: 409 }
      );
    }
    console.error("[donations/options] POST:", error.message);
    return NextResponse.json({ error: "Failed to create option." }, { status: 500 });
  }

  return NextResponse.json(data as OrgDonationOption, { status: 201 });
}
