import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripSqlArtifacts } from "@/lib/utils";

export const runtime = "nodejs";

const DEFAULT_SELECT = "display_name,email,billing_address,total_lifetime_value,last_donation_date";
const MAX_ROWS = 5000;

/** Report builder column id -> DB column(s) and CSV header label. */
const REPORT_COLUMN_CONFIG: Record<
  string,
  { dbColumns: string[]; label: string }
> = {
  first_name: { dbColumns: ["first_name", "display_name"], label: "First Name" },
  last_name: { dbColumns: ["last_name", "display_name"], label: "Last Name" },
  display_name: { dbColumns: ["display_name"], label: "Display Name" },
  email: { dbColumns: ["email"], label: "Email" },
  phone: { dbColumns: ["phone"], label: "Phone" },
  street_address: { dbColumns: ["billing_address"], label: "Street Address" },
  city: { dbColumns: ["city"], label: "City" },
  state: { dbColumns: ["state"], label: "State" },
  zip: { dbColumns: ["zip"], label: "Zip" },
  lifetime_value: { dbColumns: ["total_lifetime_value"], label: "Lifetime Value" },
  last_gift_date: { dbColumns: ["last_donation_date"], label: "Last Gift Date" },
  last_gift_amount: { dbColumns: ["last_donation_amount"], label: "Last Gift Amount" },
};

const VALID_COLUMN_IDS = new Set(Object.keys(REPORT_COLUMN_CONFIG));

type FilterRow = {
  id: string;
  field: string;
  operator: string;
  value: string | number | string[];
  value2?: string | number;
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildSelectFromColumns(selectedColumns: string[]): string {
  const set = new Set<string>();
  for (const id of selectedColumns) {
    const config = REPORT_COLUMN_CONFIG[id];
    if (config) for (const col of config.dbColumns) set.add(col);
  }
  const list = Array.from(set);
  return list.length > 0 ? list.join(",") : DEFAULT_SELECT;
}

function mapRowToOutputColumns(
  raw: Record<string, unknown>,
  selectedColumns: string[]
): Record<string, unknown> {
  const displayName = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
  const parts = displayName.split(/\s+/).filter(Boolean);
  const derivedFirst = parts.length <= 1 ? (parts[0] ?? "") : parts.slice(0, -1).join(" ");
  const derivedLast = parts.length <= 1 ? "" : (parts[parts.length - 1] ?? "");

  const out: Record<string, unknown> = {};
  for (const id of selectedColumns) {
    const config = REPORT_COLUMN_CONFIG[id];
    if (!config) continue;
    if (id === "first_name") {
      const v = raw.first_name;
      out[id] = typeof v === "string" && v.trim() !== "" ? v.trim() : derivedFirst;
    } else if (id === "last_name") {
      const v = raw.last_name;
      out[id] = typeof v === "string" && v.trim() !== "" ? v.trim() : derivedLast;
    } else {
      const dbCol = config.dbColumns[0];
      out[id] = raw[dbCol] ?? "";
    }
  }
  return out;
}

/** Build title and summary from filters for display. */
function buildTitleAndSummary(filters: FilterRow[]): { title: string; summary: string } {
  if (filters.length === 0) {
    return { title: "Filter Report", summary: "All donors (no filters)" };
  }
  const parts: string[] = [];
  for (const f of filters) {
    const val = Array.isArray(f.value) ? f.value.length : f.value;
    const val2 = f.value2 != null ? ` and ${f.value2}` : "";
    parts.push(`${f.field} ${f.operator} ${val}${val2}`);
  }
  return {
    title: "Filter Report",
    summary: parts.join("; "),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      filters?: unknown;
      selectedColumns?: unknown;
    } | null;
    const rawFilters = body?.filters;
    const rawSelectedColumns = body?.selectedColumns;
    const selectedColumns: string[] = Array.isArray(rawSelectedColumns)
      ? (rawSelectedColumns as string[]).filter((c) => typeof c === "string" && VALID_COLUMN_IDS.has(c))
      : Array.from(VALID_COLUMN_IDS);

    const filters: FilterRow[] = Array.isArray(rawFilters)
      ? (rawFilters as FilterRow[]).filter(
          (f) => f && typeof f.field === "string" && typeof f.operator === "string"
        )
      : [];

    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    const selectStr = buildSelectFromColumns(selectedColumns);

    let q = supabase
      .from("donors")
      .select(selectStr)
      .eq("org_id", auth.orgId)
      .limit(MAX_ROWS);

    // Tags filter: donor_ids that have at least one of the selected tags
    const tagFilter = filters.find((f) => f.field === "tags");
    if (tagFilter && Array.isArray(tagFilter.value) && tagFilter.value.length > 0) {
      const { data: donorTagRows } = await supabase
        .from("donor_tags")
        .select("donor_id")
        .in("tag_id", tagFilter.value);
      const donorIdsWithTag = [...new Set((donorTagRows ?? []).map((r) => r.donor_id))];
      if (donorIdsWithTag.length === 0) {
        return NextResponse.json(
          { error: "Generated report is empty. No donors match the selected tags." },
          { status: 400 }
        );
      }
      q = q.in("id", donorIdsWithTag);
    }

    // Apply donor-table filters (excluding gift_count and first_donation_date - those need post-fetch)
    // Refactor: apply all simple filters first, then fetch. For gift_count and first_donation_date,
    // we need a different approach - fetch donors first, then filter in memory, or use raw SQL.
    // For now, skip gift_count and first_donation_date in the initial query and add them as
    // post-fetch filters if needed. Actually that won't work well for large datasets.
    // Better: apply deterministic filters (total_lifetime_value, last_donation_amount, dates, state, city, zip, lifecycle, tags)
    // and defer gift_count/first_donation_date to a follow-up. Let me simplify: don't support gift_count
    // and first_donation_date in the first iteration - they require subqueries. I'll remove the gift_count
    // block above (it's wrong anyway - we're calling q.select before q has executed) and add a TODO.
    // Actually let me do it properly: run the base query with all simple filters, get donor ids, then for
    // gift_count and first_donation_date run separate queries and intersect. Let me rewrite.

    for (const f of filters) {
      if (f.field === "tags" || f.field === "gift_count" || f.field === "first_donation_date")
        continue;

      const col = f.field === "total_lifetime_value"
        ? "total_lifetime_value"
        : f.field === "last_donation_amount"
          ? "last_donation_amount"
            : f.field === "last_donation_date"
            ? "last_donation_date"
            : f.field === "state"
                ? "state"
                : f.field === "city"
                  ? "city"
                  : f.field === "zip"
                    ? "zip"
                    : null;

      if (!col) continue;

      const op = f.operator;
      const val = f.value;
      const val2 = f.value2;

      if (f.field === "lifecycle_status") {
        const status = String(val || "").trim();
        if (!["New", "Active", "Lapsed", "Lost"].includes(status)) continue;
        const now = Date.now();
        const sixMo = new Date(now - 6 * MONTH_MS).toISOString().slice(0, 10);
        const twelveMo = new Date(now - 12 * MONTH_MS).toISOString().slice(0, 10);
        const twentyFourMo = new Date(now - 24 * MONTH_MS).toISOString().slice(0, 10);
        if (status === "New") {
          q = q.gte("last_donation_date", sixMo);
        } else if (status === "Active") {
          q = q.lt("last_donation_date", sixMo).gte("last_donation_date", twelveMo);
        } else if (status === "Lapsed") {
          q = q.lt("last_donation_date", twelveMo).gte("last_donation_date", twentyFourMo);
        } else {
          q = q.or(`last_donation_date.lt.${twentyFourMo},last_donation_date.is.null`);
        }
        continue;
      }

      if (op === "eq") {
        q = q.eq(col, val);
      } else if (op === "gt") {
        q = q.gt(col, val as number | string);
      } else if (op === "gte") {
        q = q.gte(col, val as number | string);
      } else if (op === "lt") {
        q = q.lt(col, val as number | string);
      } else if (op === "lte") {
        q = q.lte(col, val as number | string);
      } else if (op === "between" && val2 != null) {
        q = q.gte(col, val as number | string).lte(col, val2 as number | string);
      } else if (op === "contains") {
        q = q.ilike(col, `%${String(val)}%`);
      } else if (op === "is_exactly") {
        q = q.eq(col, val);
      } else if (op === "before") {
        q = q.lt(col, String(val));
      } else if (op === "after") {
        q = q.gt(col, String(val));
      }
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { error: "Failed to execute report query.", details: error.message },
        { status: 500 }
      );
    }

    let rawRows = Array.isArray(data) ? (data as unknown as Array<Record<string, unknown>>) : [];
    const donorIds = rawRows.map((r) => r.id as string).filter(Boolean);

    // Post-fetch: gift_count and first_donation_date (require donations subquery)
    const giftCountFilter = filters.find((f) => f.field === "gift_count");
    const firstDateFilter = filters.find((f) => f.field === "first_donation_date");
    if ((giftCountFilter || firstDateFilter) && donorIds.length > 0) {
      const { data: donations } = await supabase
        .from("donations")
        .select("donor_id,date")
        .in("donor_id", donorIds);
      const countByDonor = new Map<string, number>();
      const firstByDonor = new Map<string, string>();
      for (const r of donations ?? []) {
        const did = (r as { donor_id: string; date: string }).donor_id;
        const d = (r as { donor_id: string; date: string }).date;
        countByDonor.set(did, (countByDonor.get(did) ?? 0) + 1);
        if (d) {
          const cur = firstByDonor.get(did);
          if (!cur || d < cur) firstByDonor.set(did, d);
        }
      }
      let keepIds = new Set(donorIds);
      if (giftCountFilter && giftCountFilter.value != null && giftCountFilter.value !== "") {
        const op = giftCountFilter.operator;
        const val = Number(giftCountFilter.value);
        const val2 = giftCountFilter.value2 != null ? Number(giftCountFilter.value2) : null;
        keepIds = new Set(
          donorIds.filter((id) => {
            const cnt = countByDonor.get(id) ?? 0;
            if (op === "eq") return cnt === val;
            if (op === "gt") return cnt > val;
            if (op === "gte") return cnt >= val;
            if (op === "lt") return cnt < val;
            if (op === "lte") return cnt <= val;
            if (op === "between" && val2 != null) return cnt >= val && cnt <= val2;
            return true;
          })
        );
      }
      if (firstDateFilter && firstDateFilter.value != null && firstDateFilter.value !== "") {
        const op = firstDateFilter.operator;
        const v = String(firstDateFilter.value);
        const v2 = firstDateFilter.value2 != null ? String(firstDateFilter.value2) : null;
        keepIds = new Set(
          [...keepIds].filter((id) => {
            const firstDate = firstByDonor.get(id);
            if (!firstDate) return false; // no donations = no join date, exclude
            if (op === "before") return firstDate < v;
            if (op === "after") return firstDate > v;
            if (op === "between" && v2 != null) return firstDate >= v && firstDate <= v2;
            return true;
          })
        );
      }
      rawRows = rawRows.filter((r) => keepIds.has(r.id as string));
    }
    const { title, summary } = buildTitleAndSummary(filters);
    const headerLabels = selectedColumns.map((id) => REPORT_COLUMN_CONFIG[id]?.label ?? id);
    const outputRows = rawRows.map((raw) => mapRowToOutputColumns(raw, selectedColumns));
    const csv = [
      headerLabels.map(escapeCsvCell).join(","),
      ...outputRows.map((row) => selectedColumns.map((id) => escapeCsvCell(row[id])).join(",")),
    ].join("\n");
    const rowCount = rawRows.length;

    if (!csv.trim()) {
      return NextResponse.json(
        { error: "Generated report is empty. Try broader filters." },
        { status: 400 }
      );
    }

    const organization_id = auth.orgId;
    const csvBytes = Buffer.byteLength(csv, "utf8");
    const queryValue = "";
    const insertPayloads: Array<Record<string, unknown>> = [
      { organization_id, title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { organization_id, title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { organization_id, title, filter_criteria: { type: "CSV", content: csv, summary, row_count: rowCount, bytes: csvBytes } },
      { title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { title, filter_criteria: { type: "CSV", content: csv, summary, row_count: rowCount, bytes: csvBytes } },
    ];

    let inserted: { id?: string } | null = null;
    const errors: string[] = [];
    for (const payload of insertPayloads) {
      const { data: ins, error: insErr } = await supabase
        .from("saved_reports")
        .insert(payload as Record<string, unknown>)
        .select("id")
        .single();
      if (!insErr) {
        inserted = ins;
        break;
      }
      errors.push(insErr.message);
    }

    if (!inserted) {
      return NextResponse.json(
        { error: errors[0] ?? "Failed to save report.", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: String(inserted?.id ?? ""),
      rowCount,
      bytes: csvBytes,
      title: stripSqlArtifacts(title),
      summary: stripSqlArtifacts(summary),
    });
  } catch (e: unknown) {
    const err = e as { message?: string; details?: string; hint?: string };
    const message = err?.message ?? (e instanceof Error ? e.message : "Unknown error");
    console.error("Report generate error:", message);
    return NextResponse.json(
      { error: message, details: err?.details ?? err?.hint ?? message },
      { status: 500 }
    );
  }
}
