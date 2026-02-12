import OpenAI from "openai";
import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripSqlArtifacts } from "@/lib/utils";

export const runtime = "nodejs";

/** Donors table columns we allow in filters and in select. */
const DONORS_FILTER_COLUMNS = new Set([
  "display_name",
  "email",
  "billing_address",
  "total_lifetime_value",
  "last_donation_date",
]);
const ALLOWED_OPERATORS = new Set(["ilike", "like", "eq", "gt", "gte", "lt", "lte"]);

const DEFAULT_SELECT = "display_name,email,billing_address,total_lifetime_value,last_donation_date";
const MAX_ROWS = 5000;

/** US state name -> abbreviation for strict location filtering. */
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

type FilterSpec = { column: string; operator: string; value: string | number };

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function jsonToCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  if (rows.length === 0) return headers.map(escapeCsvCell).join(",");
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell((row as Record<string, unknown>)[h])).join(","));
  }
  return lines.join("\n");
}

/**
 * System prompt: LLM sees only schema and returns a JSON with filters (no donor data).
 * For location we require two ilike filters (state name + abbreviation) so we can OR them.
 */
const SCHEMA_DESCRIPTION = `
Donors table columns (use these exact names in "column" field):
- display_name (text): donor name
- email (text)
- billing_address (text): unstructured address e.g. "123 Main St, Detroit, MI 48201"
- total_lifetime_value (numeric): total giving
- last_donation_date (date, ISO string)

You must return JSON only: { "title": string, "summary": string, "filters": [ { "column": string, "operator": string, "value": string or number } ] }
Allowed operators: ilike, like, eq, gt, gte, lt, lte.

Location rule (critical): For any US state or location in the prompt (e.g. "in Michigan", "donors in Texas"):
  Output TWO separate filters for billing_address, both with operator "ilike":
  1) value containing the full state name, e.g. "%Michigan%" or "%Texas%"
  2) value containing the state abbreviation with commas/spaces to avoid false matches, e.g. "%, MI %" or "%, TX %"
  We will combine these with OR so only donors in that state match. Never use a single pattern like "%Michigan MI%".

Amount rule: For "over $500", "under 1000", etc., use column "total_lifetime_value" and operator gt, gte, lt, or lte with a numeric value.
Summary: Short human-readable criteria only; no SQL wildcards (%, _) in the summary.
`;

function parseAndValidateFilters(raw: unknown): FilterSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: FilterSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    let col = typeof (item as any).column === "string" ? (item as any).column.trim() : "";
    if (col === "address" || col === "state") col = "billing_address";
    const op = typeof (item as any).operator === "string" ? (item as any).operator.toLowerCase().trim() : "";
    const val = (item as any).value;
    if (!DONORS_FILTER_COLUMNS.has(col) || !ALLOWED_OPERATORS.has(op)) continue;
    if (op === "ilike" || op === "like") {
      const s = typeof val === "string" ? val : String(val ?? "");
      if (s.length > 500) continue; // avoid huge patterns
      out.push({ column: col, operator: op, value: s });
    } else {
      const n = typeof val === "number" ? val : Number(val);
      if (!Number.isFinite(n)) continue;
      out.push({ column: col, operator: op, value: n });
    }
  }
  return out;
}

/**
 * Expand a single state-name pattern into 4 strictly quoted ilike variations:
 * 1. Full name (e.g. %Michigan%)
 * 2. %, MI % (comma + space + abbr + space) - standard
 * 3. %, MI,% (comma + space + abbr + comma) - matches "... MI, 48095"
 * 4. %, MI (comma + space + abbr, end of string)
 */
function expandAddressIlikeForState(value: string): string[] {
  const v = String(value).trim();
  const patterns = [v];
  const lower = v.replace(/%/g, "").trim().toLowerCase();
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (lower.includes(name)) {
      patterns.push(`%, ${abbr} %`);
      patterns.push(`%, ${abbr},%`);
      patterns.push(`%, ${abbr}`);
      break;
    }
  }
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (lower === abbr.toLowerCase() || new RegExp(`\\b${abbr}\\b`).test(lower)) {
      patterns.push(`%${name}%`);
      break;
    }
  }
  return [...new Set(patterns)];
}

/**
 * Escape and wrap a value for use inside PostgREST .or() filter string.
 * EVERY value must be double-quoted so the parser does not break on commas.
 */
function escapeOrValue(value: string): string {
  const escaped = String(value).replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Group billing_address ilike/like filters into one OR clause; apply others as AND.
 * Every value in the .or() string is strictly double-quoted (escapeOrValue).
 */
function buildOrAndFilters(filters: FilterSpec[]): {
  orExpr: string | null;
  andFilters: FilterSpec[];
} {
  const addressIlikes: string[] = [];
  const andFilters: FilterSpec[] = [];
  for (const f of filters) {
    if (f.column === "billing_address" && (f.operator === "ilike" || f.operator === "like")) {
      const expanded = expandAddressIlikeForState(String(f.value));
      for (const val of expanded) {
        addressIlikes.push(`${f.column}.${f.operator}.${escapeOrValue(val)}`);
      }
    } else {
      andFilters.push(f);
    }
  }
  const orExpr = addressIlikes.length > 0 ? addressIlikes.join(",") : null;
  return { orExpr, andFilters };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      prompt?: unknown;
      history?: unknown;
    } | null;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const rawHistory = body?.history;
    const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(rawHistory)
      ? (rawHistory as { role?: unknown; content?: unknown }[])
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) }))
      : [];

    if (!prompt) {
      return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    }

    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const reportHistory = history.slice(-20).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a report filter generator. You do NOT see any donor data. You only see the database schema. " +
            "Convert the user request into a JSON object with title, summary, and filters. " +
            SCHEMA_DESCRIPTION,
        },
        ...reportHistory,
        { role: "user", content: prompt },
      ],
    });

    let plan: { title?: string; summary?: string; filters?: unknown } = {};
    try {
      plan = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      plan = {};
    }

    const title = stripSqlArtifacts(typeof plan?.title === "string" ? plan.title.trim() : "AI Report");
    const summary = stripSqlArtifacts(typeof plan?.summary === "string" ? plan.summary.trim() : "");
    const filters = parseAndValidateFilters(plan?.filters);

    const { orExpr, andFilters } = buildOrAndFilters(filters);

    const supabase = createAdminClient();
    let q = supabase
      .from("donors")
      .select(DEFAULT_SELECT)
      .eq("org_id", auth.orgId)
      .limit(MAX_ROWS);

    if (orExpr) {
      console.log("🔍 Generated Filter String:", orExpr);
      q = q.or(orExpr);
    }
    for (const f of andFilters) {
      if (f.operator === "eq") q = q.eq(f.column, f.value);
      else if (f.operator === "gt") q = q.gt(f.column, f.value as number);
      else if (f.operator === "gte") q = q.gte(f.column, f.value as number);
      else if (f.operator === "lt") q = q.lt(f.column, f.value as number);
      else if (f.operator === "lte") q = q.lte(f.column, f.value as number);
      else if (f.operator === "ilike") q = q.ilike(f.column, f.value as string);
      else if (f.operator === "like") q = q.like(f.column, f.value as string);
    }

    const { data, error } = await q;
    console.log("✅ Donors Found:", data?.length ?? 0);
    if (error) {
      return NextResponse.json(
        { error: "Failed to execute report query.", details: error.message },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    const headers = ["display_name", "email", "billing_address", "total_lifetime_value", "last_donation_date"];
    const csv = jsonToCsv(rows, headers);
    const rowCount = rows.length;

    if (!csv.trim()) {
      return NextResponse.json(
        { error: "Generated report is empty. Try broader filters." },
        { status: 400 }
      );
    }

    const organization_id = auth.orgId;

    const csvBytes = Buffer.byteLength(csv, "utf8");
    // query column is NOT NULL in DB; use "" for text-to-query reports (no SQL).
    const queryValue = "";
    // Try multiple shapes: 09+10 first, then 09 without org_id, then legacy filter_criteria only (04)
    const insertPayloads: Array<Record<string, unknown>> = [
      { organization_id, title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { organization_id, title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { organization_id, title, filter_criteria: { type: "CSV", content: csv, summary, row_count: rowCount, bytes: csvBytes } },
      { title, type: "CSV", content: csv, query: queryValue, summary, records_count: rowCount },
      { title, filter_criteria: { type: "CSV", content: csv, summary, row_count: rowCount, bytes: csvBytes } },
    ];
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "app/api/reports/generate/route.ts:insertPayloads", message: "Payload keys for insert", data: { firstPayloadKeys: Object.keys(insertPayloads[0] ?? {}) }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H2" }) }).catch(() => {});
    // #endregion

    let inserted: { id?: string } | null = null;
    const errors: string[] = [];
    for (let i = 0; i < insertPayloads.length; i++) {
      const payload = insertPayloads[i];
      const { data: ins, error: insErr } = await supabase
        .from("saved_reports")
        .insert(payload as Record<string, unknown>)
        .select("id")
        .single();
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "app/api/reports/generate/route.ts:insertAttempt", message: "Insert attempt result", data: { index: i, insErrMessage: insErr?.message ?? null, insErrCode: (insErr as any)?.code ?? null, insErrDetails: (insErr as any)?.details ?? null }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H3" }) }).catch(() => {});
      // #endregion
      if (!insErr) {
        inserted = ins;
        break;
      }
      errors.push(insErr.message);
    }

    if (!inserted) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/01c38610-da7f-4170-bdeb-e8e855963b1d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: "app/api/reports/generate/route.ts:insertFailed", message: "All insert attempts failed", data: { errors }, timestamp: Date.now(), sessionId: "debug-session", hypothesisId: "H5" }) }).catch(() => {});
      // #endregion
      const firstError = errors[0] ?? "Failed to save report.";
      return NextResponse.json(
        { error: firstError, details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: String(inserted?.id ?? ""),
      rowCount,
      bytes: csvBytes,
      title,
      summary,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; details?: string; hint?: string };
    const message = err?.message ?? (e instanceof Error ? e.message : "Unknown error");
    console.error("Report generate error:", e);
    return NextResponse.json(
      { error: message, details: err?.details ?? err?.hint ?? message },
      { status: 500 }
    );
  }
}
