import { NextRequest, NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;

/** Query params for donor map filtering (all optional). */
export interface DonorFilterParams {
  status?: string;
  minGiving?: string;
  maxGiving?: string;
}

function getEighteenMonthsAgoIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().slice(0, 10);
}

/** Fetch all rows by paginating; avoids Supabase default 1000 row cap. */
async function fetchAllDonorsWithCoords(
  baseQuery: { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }
): Promise<unknown[]> {
  const all: unknown[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await baseQuery.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const orgId = auth.orgId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const minGivingParam = searchParams.get("minGiving");
    const maxGivingParam = searchParams.get("maxGiving");

    const minGiving =
      minGivingParam !== null && minGivingParam !== ""
        ? Number(minGivingParam)
        : undefined;
    const maxGiving =
      maxGivingParam !== null && maxGivingParam !== ""
        ? Number(maxGivingParam)
        : undefined;

    let query = supabase
      .from("donors")
      .select("id,display_name,total_lifetime_value,last_donation_date,location_lat,location_lng")
      .eq("org_id", orgId)
      .not("location_lat", "is", null)
      .not("location_lng", "is", null);

    const eighteenMonthsAgo = getEighteenMonthsAgoIso();
    if (status === "active") {
      query = query.gte("last_donation_date", eighteenMonthsAgo);
    } else if (status === "lapsed") {
      query = query.or(
        `last_donation_date.lt.${eighteenMonthsAgo},last_donation_date.is.null`
      );
    }

    if (minGiving !== undefined && Number.isFinite(minGiving)) {
      query = query.gte("total_lifetime_value", minGiving);
    }
    if (maxGiving !== undefined && Number.isFinite(maxGiving)) {
      query = query.lte("total_lifetime_value", maxGiving);
    }

    const data = await fetchAllDonorsWithCoords(query);

    const points = (data ?? []).map((d: unknown) => {
      const row = d as Record<string, unknown>;
      return {
        id: row.id,
        display_name: row.display_name,
        total_lifetime_value: row.total_lifetime_value,
        last_donation_date: row.last_donation_date,
        location_lat: row.location_lat as number,
        location_lng: row.location_lng as number,
      };
    });

    return NextResponse.json(points);
  } catch {
    return NextResponse.json(
      { error: "Failed to load donor map points." },
      { status: 500 }
    );
  }
}
