import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("donors")
    .select(
      "id,display_name,location_lat,location_lng,total_lifetime_value,last_donation_date,billing_address"
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch donors.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ donors: data ?? [] });
}

