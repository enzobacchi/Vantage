import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type OrgDonationOption = {
  id: string;
  org_id: string;
  type: "category" | "campaign" | "fund";
  name: string;
  sort_order: number;
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as "category" | "campaign" | "fund" | null;

  const supabase = createAdminClient();
  let query = supabase
    .from("org_donation_options")
    .select("id,org_id,type,name,sort_order")
    .eq("org_id", auth.orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (type && ["category", "campaign", "fund"].includes(type)) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to load options.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as OrgDonationOption[]);
}
