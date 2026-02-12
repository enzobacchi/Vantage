import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type DonorListItem = {
  id: string;
  display_name: string | null;
  total_lifetime_value: number | string | null;
  last_donation_amount: number | string | null;
  last_donation_date: string | null;
  billing_address: string | null;
  state: string | null;
  notes: string | null;
};

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("donors")
    .select("id,display_name,total_lifetime_value,last_donation_amount,last_donation_date,billing_address,state,notes")
    .eq("org_id", auth.orgId)
    .order("total_lifetime_value", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load donors.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as DonorListItem[]);
}

