import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripSqlArtifacts } from "@/lib/utils";

export const runtime = "nodejs";

type CreateReportBody = {
  title?: unknown;
  sqlQuery?: unknown;
  summary?: unknown;
};

type ParsedQuery = {
  table: "donors" | "donations";
  joinDonors: boolean; // only supported when table="donations"
  select: Array<{
    source: "donors" | "donations";
    col: string;
    header: string;
    agg?: "sum";
  }>;
  filters: Array<
    | { op: "eq"; col: string; value: string | number }
    | { op: "gt" | "gte" | "lt" | "lte"; col: string; value: number }
    | { op: "ilike" | "like"; col: string; value: string }
    | { op: "isnull" | "notnull"; col: string }
    | { op: "or"; expr: string }
  >;
  orderBy?: { col: string; ascending: boolean };
  limit: number;
};

const DONOR_COLS = new Set([
  "id",
  "org_id",
  "qb_customer_id",
  "display_name",
  "email",
  "phone",
  "billing_address",
  "location_lat",
  "location_lng",
  "total_lifetime_value",
  "last_donation_date",
  "last_donation_amount",
]);

const DONATION_COLS = new Set(["id", "donor_id", "amount", "date", "memo"]);

/** Get value from a donation row (with nested donors) for a column name (donors.x or x). */
function getCellValue(row: Record<string, unknown>, col: string): unknown {
  const donors = row?.donors as Record<string, unknown> | null | undefined;
  if (col.startsWith("donors.")) {
    const c = col.slice(7);
    return donors != null && typeof donors === "object" ? donors[c] ?? null : null;
  }
  if (DONOR_COLS.has(col)) return donors != null && typeof donors === "object" ? donors[col] ?? null : null;
  return row[col] ?? null;
}

type FilterClause = ParsedQuery["filters"][number];

/** Returns true if the donation row matches all AND clauses; OR is handled inside matchesOneFilter. */
function matchesFilters(row: Record<string, unknown>, filters: FilterClause[]): boolean {
  for (const f of filters) {
    if (!matchesOneFilter(row, f)) return false;
  }
  return true;
}

function matchesOneFilter(row: Record<string, unknown>, f: FilterClause): boolean {
  if (f.op === "or") {
    // f.expr is e.g. "donors.billing_address.ilike.%Texas%,donors.billing_address.ilike.%TX%"
    const orParts = f.expr.split(",");
    for (const part of orParts) {
      const segs = part.split(".");
      if (segs.length < 4) continue;
      const col = `${segs[0]}.${segs[1]}`;
      const op = segs[2].toLowerCase();
      const value = segs.slice(3).join(".");
      const cell = getCellValue(row, col);
      const s = cell != null ? String(cell) : "";
      if (op === "ilike") {
        const pattern = value.replace(/%/g, ".*").replace(/_/g, ".");
        try {
          if (new RegExp(`^${pattern}$`, "i").test(s)) return true;
        } catch {
          if (s.toLowerCase().includes(value.toLowerCase())) return true;
        }
      } else if (op === "like") {
        const pattern = value.replace(/%/g, ".*").replace(/_/g, ".");
        try {
          if (new RegExp(`^${pattern}$`).test(s)) return true;
        } catch {
          if (s.includes(value)) return true;
        }
      }
    }
    return false;
  }

  const col = f.col.startsWith("donors.") ? f.col : DONOR_COLS.has(f.col) ? `donors.${f.col}` : f.col;
  const cell = getCellValue(row, col);

  switch (f.op) {
    case "eq":
      return cell === f.value || (typeof cell === "string" && String(f.value) === cell);
    case "gt":
      return Number(cell) > (f.value as number);
    case "gte":
      return Number(cell) >= (f.value as number);
    case "lt":
      return Number(cell) < (f.value as number);
    case "lte":
      return Number(cell) <= (f.value as number);
    case "ilike": {
      const s = cell != null ? String(cell) : "";
      const pattern = (f.value as string).replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(s);
    }
    case "like": {
      const s = cell != null ? String(cell) : "";
      const pattern = (f.value as string).replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`).test(s);
    }
    case "isnull":
      return cell == null;
    case "notnull":
      return cell != null;
    default:
      return false;
  }
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // CSV escaping: wrap in quotes if it contains special chars; double quotes inside.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function jsonToCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  // Fully dynamic CSV mapping:
  // - If rows exist, use keys from the first row (stable order).
  // - If no rows, use provided headers (header-only CSV).
  const orderedHeaders =
    rows.length > 0
      ? Object.keys(rows[0] ?? {})
      : headers && headers.length
        ? headers
        : [];

  // If there are no rows, still return a header-only CSV (so downloads work and content isn't empty).
  if (rows.length === 0) return orderedHeaders.map(escapeCsvCell).join(",");
  const lines: string[] = [];
  lines.push(orderedHeaders.map(escapeCsvCell).join(","));
  for (const row of rows) {
    lines.push(orderedHeaders.map((h) => escapeCsvCell((row as any)[h])).join(","));
  }
  return lines.join("\n");
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function ensureSafeSql(sql: string) {
  const lower = sql.toLowerCase();
  if (/[;]/.test(sql)) throw new Error("Semicolons are not allowed.");
  if (lower.includes("--") || lower.includes("/*") || lower.includes("*/")) {
    throw new Error("Comments are not allowed.");
  }
  if (!lower.trimStart().startsWith("select ")) throw new Error("Only SELECT queries are allowed.");

  // Blacklist only (as requested). Word-boundary checks reduce false positives.
  // NOTE: We still execute via a constrained parser + supabase-js, not raw SQL.
  const blacklist = ["drop", "delete", "update", "insert", "truncate", "alter", "grant", "exec", "execute"];
  for (const w of blacklist) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(sql)) throw new Error(`Forbidden keyword detected: ${w}`);
  }
}

function parseColumns(raw: string, table: "donors" | "donations"): string[] {
  const allowed = table === "donors" ? DONOR_COLS : DONATION_COLS;
  const trimmed = raw.trim();
  if (trimmed === "*") return Array.from(allowed);

  const cols = trimmed
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (cols.length === 0) throw new Error("No columns selected.");
  for (const c of cols) {
    // MVP: disallow aliases/functions
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) {
      throw new Error(`Unsupported column expression: ${c}`);
    }
    if (!allowed.has(c)) throw new Error(`Column not allowed: ${c}`);
  }
  return cols;
}

function parseSelectFields(
  raw: string,
  table: "donors" | "donations",
  joinDonors: boolean,
  joinDonations: boolean
) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("No columns selected.");

  // Split by commas, but this MVP assumes no functions/parentheses in select list.
  const parts = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const fields: ParsedQuery["select"] = [];

  const pushField = (source: "donors" | "donations", col: string, header?: string) => {
    const allowed = source === "donors" ? DONOR_COLS : DONATION_COLS;
    if (!allowed.has(col)) throw new Error(`Column not allowed: ${source}.${col}`);
    fields.push({ source, col, header: (header ?? col).trim() || col });
  };

  for (const part of parts) {
    // Allow SUM(donations.amount) AS "Total Donation"
    // Accept either: FROM donations JOIN donors ... or FROM donors JOIN donations ...
    {
      const mSum = part.match(
        /^sum\(\s*(?:(donations)\.)?(amount)\s*\)(?:\s+as\s+("([^"]+)"|'([^']+)'|([a-zA-Z_][a-zA-Z0-9_ ]*)))?$/i
      );
      if (mSum) {
        const hasDonorsAndDonations =
          (table === "donations" && joinDonors) || (table === "donors" && joinDonations);
        if (!hasDonorsAndDonations) {
          throw new Error(
            "SUM(donations.amount) requires joining donors and donations (e.g. FROM donations JOIN donors ... or FROM donors JOIN donations ...)."
          );
        }
        const quotedAlias = mSum[4];
        const singleQuotedAlias = mSum[5];
        const bareAlias = mSum[6];
        const alias = (quotedAlias ?? singleQuotedAlias ?? bareAlias ?? "Total Donation").trim();
        // Represent as an aggregate field. We will compute this server-side safely.
        fields.push({ source: "donations", col: "amount", header: alias, agg: "sum" });
        continue;
      }
    }

    // support:
    // - col
    // - table.col
    // - table.col AS "Header"
    // - table.col as Header
    const m = part.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\.([a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+as\s+("([^"]+)"|'([^']+)'|([a-zA-Z_][a-zA-Z0-9_ ]*)))?$/i
    );
    if (!m) throw new Error(`Unsupported SELECT expression: ${part}`);

    const a = m[1];
    const b = m[2];
    const quotedAlias = m[4];
    const singleQuotedAlias = m[5];
    const bareAlias = m[6];
    const alias = (quotedAlias ?? singleQuotedAlias ?? bareAlias ?? "").trim();

    if (b) {
      // qualified: a.b
      const source = a.toLowerCase();
      if (source !== "donors" && source !== "donations") throw new Error(`Unsupported table prefix: ${a}`);
      if (source === "donors" && !joinDonors && table === "donations") {
        throw new Error("Cannot select donors.* unless joining donors.");
      }
      if (source === "donations" && table === "donors" && !joinDonations) {
        throw new Error("Cannot select donations.* unless joining donations.");
      }
      pushField(source as any, b, alias || undefined);
    } else {
      // unqualified: assume base table column
      pushField(table, a, alias || undefined);
    }
  }

  // If joining donors (FROM donations) or joining donations (FROM donors), enforce human columns + forbid donor_id output
  if (table === "donations") {
    const hasDonorName = fields.some((f) => f.source === "donors" && f.col === "display_name");
    const hasDonorEmail = fields.some((f) => f.source === "donors" && f.col === "email");
    const hasDonorId = fields.some((f) => f.source === "donations" && f.col === "donor_id");
    if (hasDonorId) throw new Error("donations.donor_id is not allowed in reports. Use donors.display_name and donors.email.");
    if (joinDonors && (!hasDonorName || !hasDonorEmail)) {
      throw new Error('Donation reports must include donors.display_name AS "Donor Name" and donors.email AS "Donor Email".');
    }
    if (!joinDonors && (hasDonorName || hasDonorEmail)) {
      throw new Error("Cannot select donors.* without a JOIN donors.");
    }
  }
  if (table === "donors" && joinDonations) {
    const hasDonorId = fields.some((f) => f.source === "donations" && f.col === "donor_id");
    if (hasDonorId) throw new Error("donations.donor_id is not allowed in reports. Use donors.display_name and donors.email.");
  }

  return fields;
}

function parseWhere(
  whereRaw: string | null,
  table: "donors" | "donations",
  joinDonors: boolean
): ParsedQuery["filters"] {
  if (!whereRaw) return [];
  const stripOuterParens = (s: string) => {
    let out = s.trim();
    while (out.startsWith("(") && out.endsWith(")")) {
      // only strip if parens are balanced
      let depth = 0;
      let balanced = true;
      for (let i = 0; i < out.length; i++) {
        const ch = out[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (depth < 0) {
          balanced = false;
          break;
        }
      }
      if (!balanced || depth !== 0) break;
      out = out.slice(1, -1).trim();
    }
    return out;
  };

  const splitTopLevel = (expr: string, keyword: "and" | "or") => {
    const parts: string[] = [];
    let buf = "";
    let depth = 0;
    const lower = expr.toLowerCase();

    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);

      // detect " and " / " or " at top level
      if (depth === 0) {
        const needle = ` ${keyword} `;
        if (lower.startsWith(needle, i)) {
          parts.push(buf.trim());
          buf = "";
          i += needle.length - 1;
          continue;
        }
      }
      buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts;
  };

  const clauses = splitTopLevel(whereRaw.trim(), "and").map(stripOuterParens).filter(Boolean);

  const filters: ParsedQuery["filters"] = [];
  let orCount = 0;
  for (const clause of clauses) {
    const parseCol = (rawCol: string) => {
      const m = rawCol.match(/^(donors|donations)\.([a-zA-Z_][a-zA-Z0-9_]*)$/i);
      if (m) {
        const t = m[1].toLowerCase() as "donors" | "donations";
        const col = m[2];
        if (t === "donors") {
          if (!((table === "donations" && joinDonors) || table === "donors")) {
            throw new Error("Filtering on donors.* is only allowed when querying donations with a JOIN donors or when FROM donors.");
          }
          if (!DONOR_COLS.has(col)) throw new Error(`Column not allowed: donors.${col}`);
          return { full: `donors.${col}`, base: "donors" as const };
        }
        // donations.*
        if (table !== "donations") throw new Error("donations.* prefix only allowed when FROM donations.");
        if (!DONATION_COLS.has(col)) throw new Error(`Column not allowed: donations.${col}`);
        return { full: col, base: "donations" as const }; // keep base-table filters unqualified
      }

      // unqualified column: must belong to base table
      const col = rawCol;
      if (table === "donors") {
        if (!DONOR_COLS.has(col)) throw new Error(`Column not allowed: ${col}`);
        return { full: col, base: "donors" as const };
      }
      if (!DONATION_COLS.has(col)) throw new Error(`Column not allowed: ${col}`);
      return { full: col, base: "donations" as const };
    };

    // Limited OR support (for "smart location" patterns), including parenthesized groups:
    // Example: (donors.billing_address ILIKE '%Texas%' OR donors.billing_address ILIKE '%TX%')
    const orParts = splitTopLevel(clause, "or").map(stripOuterParens).filter(Boolean);
    if (orParts.length > 1) {
      orCount += 1;
      if (orCount > 1) {
        throw new Error("Only one OR group is supported in WHERE (to keep execution safe).");
      }

      let orCol: string | null = null;
      const orPieces: string[] = [];

      for (const p0 of orParts) {
        const p = stripOuterParens(p0);
        const m = p.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s+(ilike|like)\s+'([^']*)'$/i
        );
        if (!m) throw new Error(`Unsupported OR clause: ${clause}`);
        const colInfo = parseCol(m[1]);
        const col = colInfo.full;
        const op = m[2].toLowerCase() as "ilike" | "like";
        const value = m[3];
        if (!orCol) orCol = col;
        if (orCol !== col) throw new Error("OR is only supported for the same column.");
        orPieces.push(`${col}.${op}.${value}`);
      }

      filters.push({ op: "or", expr: orPieces.join(",") });
      continue;
    }

    // col is null / is not null
    let m = clause.match(/^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s+is\s+(not\s+)?null$/i);
    if (m) {
      const col = parseCol(m[1]).full;
      filters.push({ op: m[2] ? "notnull" : "isnull", col });
      continue;
    }

    // ilike/like
    m = clause.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s+(ilike|like)\s+'([^']*)'$/i
    );
    if (m) {
      const col = parseCol(m[1]).full;
      const op = m[2].toLowerCase() as "ilike" | "like";
      const value = m[3];
      filters.push({ op, col, value });
      continue;
    }

    // numeric comparisons
    m = clause.match(
      /^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*(=|>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?)$/
    );
    if (m) {
      const col = parseCol(m[1]).full;
      const opSymbol = m[2];
      const value = Number(m[3]);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${m[3]}`);
      if (opSymbol === "=") filters.push({ op: "eq", col, value });
      else if (opSymbol === ">") filters.push({ op: "gt", col, value });
      else if (opSymbol === ">=") filters.push({ op: "gte", col, value });
      else if (opSymbol === "<") filters.push({ op: "lt", col, value });
      else filters.push({ op: "lte", col, value });
      continue;
    }

    // string equality
    m = clause.match(/^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*=\s*'([^']*)'$/);
    if (m) {
      const col = parseCol(m[1]).full;
      const value = m[2];
      filters.push({ op: "eq", col, value });
      continue;
    }

    throw new Error(`Unsupported WHERE clause: ${clause}`);
  }
  return filters;
}

function parseSqlToPostgrest(sqlQuery: string): ParsedQuery {
  const sql = normalizeSql(sqlQuery);
  ensureSafeSql(sql);
  const lower = sql.toLowerCase();

  // Very small subset:
  // SELECT <cols> FROM <donors|donations>
  //   [JOIN/LEFT JOIN/INNER JOIN donors ON donations.donor_id = donors.id]
  //   [WHERE ...] [GROUP BY ...] [ORDER BY ...] [LIMIT n]
  const fromMatch = lower.match(/\sfrom\s+(donors|donations)\b/);
  if (!fromMatch) throw new Error("Query must target donors or donations.");
  const table = fromMatch[1] as "donors" | "donations";

  const selectPart = sql.slice(6, lower.indexOf(" from ")).trim(); // after "select"
  const afterFrom = sql.slice(lower.indexOf(" from ") + 6).trim();

  const joinDonors =
    table === "donations" &&
    /\b(?:left\s+join|inner\s+join|join)\s+donors\s+on\s+donations\.donor_id\s*=\s*donors\.id\b/i.test(
      afterFrom
    );

  // FROM donors JOIN donations ON donations.donor_id = donors.id (same join, other direction)
  const joinDonations =
    table === "donors" &&
    /\b(?:left\s+join|inner\s+join|join)\s+donations\s+on\s+donations\.donor_id\s*=\s*donors\.id\b/i.test(
      afterFrom
    );

  // Extract clauses
  const whereIdx = afterFrom.toLowerCase().indexOf(" where ");
  const groupIdx = afterFrom.toLowerCase().indexOf(" group by ");
  const orderIdx = afterFrom.toLowerCase().indexOf(" order by ");
  const limitIdx = afterFrom.toLowerCase().indexOf(" limit ");

  const clauseCutPoints = [whereIdx, groupIdx, orderIdx, limitIdx].filter((x) => x >= 0);
  const firstClauseIdx = clauseCutPoints.length ? Math.min(...clauseCutPoints) : -1;

  const fromTarget = (firstClauseIdx >= 0 ? afterFrom.slice(0, firstClauseIdx) : afterFrom)
    .trim()
    .split(/\s+/)[0];
  if (fromTarget.toLowerCase() !== table) throw new Error("Unsupported FROM clause.");

  let whereRaw: string | null = null;
  let _groupRaw: string | null = null; // accepted but ignored (we compute SUM reports safely in code)
  let orderRaw: string | null = null;
  let limitRaw: string | null = null;

  if (whereIdx >= 0) {
    const end = [groupIdx, orderIdx, limitIdx].filter((x) => x > whereIdx);
    const cut = end.length ? Math.min(...end) : afterFrom.length;
    whereRaw = afterFrom.slice(whereIdx + 7, cut).trim();
  }
  if (groupIdx >= 0) {
    const end = [orderIdx, limitIdx].filter((x) => x > groupIdx);
    const cut = end.length ? Math.min(...end) : afterFrom.length;
    _groupRaw = afterFrom.slice(groupIdx + 10, cut).trim();
  }
  if (orderIdx >= 0) {
    const end = [limitIdx].filter((x) => x > orderIdx);
    const cut = end.length ? Math.min(...end) : afterFrom.length;
    orderRaw = afterFrom.slice(orderIdx + 10, cut).trim();
  }
  if (limitIdx >= 0) {
    limitRaw = afterFrom.slice(limitIdx + 7).trim();
  }

  const select = parseSelectFields(selectPart, table, joinDonors, joinDonations);
  const filters = parseWhere(whereRaw, table, joinDonors);

  let orderBy: ParsedQuery["orderBy"] | undefined;
  if (orderRaw) {
    const m = orderRaw.match(/^((?:donors|donations)\.)?([a-zA-Z_][a-zA-Z0-9_]*)(\s+(asc|desc))?$/i);
    if (!m) throw new Error("Unsupported ORDER BY clause.");
    const prefix = (m[1] ?? "").toLowerCase();
    const rawCol = m[2];
    const dir = (m[4] ?? "asc").toLowerCase();

    if (!prefix) {
      const allowed = table === "donors" ? DONOR_COLS : DONATION_COLS;
      if (!allowed.has(rawCol)) throw new Error(`Column not allowed: ${rawCol}`);
      orderBy = { col: rawCol, ascending: dir !== "desc" };
    } else if (prefix === "donations.") {
      if (table !== "donations") throw new Error("Cannot ORDER BY donations.* unless FROM donations.");
      if (!DONATION_COLS.has(rawCol)) throw new Error(`Column not allowed: donations.${rawCol}`);
      orderBy = { col: rawCol, ascending: dir !== "desc" };
    } else {
      // donors.
      if (!((table === "donations" && joinDonors) || table === "donors")) {
        throw new Error("Cannot ORDER BY donors.* unless joining donors or when FROM donors.");
      }
      if (!DONOR_COLS.has(rawCol)) throw new Error(`Column not allowed: donors.${rawCol}`);
      orderBy = {
        col: table === "donors" ? rawCol : `donors.${rawCol}`,
        ascending: dir !== "desc",
      };
    }
  }

  let limit = 500;
  if (limitRaw) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid LIMIT.");
    limit = Math.min(5000, Math.floor(n));
  }

  return { table, joinDonors, select, filters, orderBy, limit };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateReportBody | null;
  const title = stripSqlArtifacts(typeof body?.title === "string" ? body.title.trim() : "");
  const sqlQuery = typeof body?.sqlQuery === "string" ? body.sqlQuery.trim() : "";
  const summary = stripSqlArtifacts(typeof body?.summary === "string" ? body.summary.trim() : "");

  if (!title || !sqlQuery) {
    return badRequest("Missing title or sqlQuery.");
  }

  let parsed: ParsedQuery;
  try {
    console.log("Attempting SQL:", sqlQuery);
    parsed = parseSqlToPostgrest(sqlQuery);
  } catch (e) {
    console.error(
      "SQL rejected:",
      e instanceof Error ? e.message : String(e),
      "\nSQL:",
      sqlQuery
    );
    return badRequest(
      "Unsupported or unsafe SQL. Only simple SELECT queries against donors/donations are allowed.",
      e instanceof Error ? e.message : String(e)
    );
  }

  const supabase = createAdminClient();

  // Execute query via PostgREST (supabase-js)
  let selectStr = "";
  const donationCols = parsed.select
    .filter((f) => f.source === "donations" && !f.agg)
    .map((f) => f.col);
  const donorCols = parsed.select.filter((f) => f.source === "donors").map((f) => f.col);
  const uniqueDonationCols = Array.from(new Set(donationCols));
  const uniqueDonorCols = Array.from(new Set(donorCols));

  const wantsSum = parsed.select.some((s) => s.agg === "sum" && s.source === "donations" && s.col === "amount");

  // For SUM reports, we safely compute aggregation in code (no raw SQL execution).
  // Accept both FROM donations JOIN donors and FROM donors JOIN donations.
  // Use "Fetch-Then-Filter": fetch donations with donors!inner, apply WHERE in JS to avoid PostgREST nested filter issues.
  if (wantsSum) {
    const requiredDonorCols = new Set<string>();
    for (const s of parsed.select) {
      if (s.source === "donors") requiredDonorCols.add(s.col);
    }
    requiredDonorCols.add("display_name");
    requiredDonorCols.add("email");
    requiredDonorCols.add("billing_address");

    const donorColsForFetch = Array.from(requiredDonorCols);
    selectStr = `amount,date,donors!inner(${donorColsForFetch.join(",")})`;

    const hasDonorFilters = parsed.filters.some(
      (f) => f.op === "or" || f.col.startsWith("donors.") || DONOR_COLS.has(f.col)
    );
    const fetchLimit = hasDonorFilters ? Math.min(50000, Math.max(parsed.limit * 5, 10000)) : parsed.limit;

    const { data: orgDonors } = await supabase.from("donors").select("id").eq("org_id", auth.orgId);
    const donorIds = (orgDonors ?? []).map((d: { id: string }) => d.id);

    const q = supabase
      .from("donations")
      .select(selectStr)
      .in("donor_id", donorIds.length ? donorIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(fetchLimit);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { error: "Failed to execute report query.", details: error.message },
        { status: 500 }
      );
    }

    let rawRows = Array.isArray(data) ? (data as any[]) : [];
    if (parsed.filters.length > 0) {
      rawRows = rawRows.filter((r) => matchesFilters(r, parsed.filters));
    }

    // Aggregate by donor identity (prefer email, fallback to display_name+billing_address).
    const sumHeader =
      parsed.select.find((s) => s.agg === "sum" && s.source === "donations" && s.col === "amount")?.header ??
      "Total Donation";

    const rowsByKey = new Map<
      string,
      { name: string; email: string; billing: string; total: number }
    >();

    for (const r of rawRows) {
      const donorsObj = r?.donors ?? null;
      const name = donorsObj?.display_name ? String(donorsObj.display_name) : "";
      const email = donorsObj?.email ? String(donorsObj.email) : "";
      const billing = donorsObj?.billing_address ? String(donorsObj.billing_address) : "";
      const amount = Number(r?.amount ?? 0);
      const key = (email || `${name}|${billing}`).toLowerCase();
      if (!key) continue;
      const prev = rowsByKey.get(key) ?? { name, email, billing, total: 0 };
      prev.total += Number.isFinite(amount) ? amount : 0;
      // Keep latest non-empty fields
      prev.name = prev.name || name;
      prev.email = prev.email || email;
      prev.billing = prev.billing || billing;
      rowsByKey.set(key, prev);
    }

    // Build output rows using the requested headers (fully alias-driven).
    // If the AI used different aliases than "Name"/"Email"/"Billing Address", we honor them.
    const nameHeader =
      parsed.select.find((s) => s.source === "donors" && s.col === "display_name")?.header ?? "Name";
    const emailHeader =
      parsed.select.find((s) => s.source === "donors" && s.col === "email")?.header ?? "Email";
    const billingHeader =
      parsed.select.find((s) => s.source === "donors" && s.col === "billing_address")?.header ?? "Billing Address";

    const projectedRows = Array.from(rowsByKey.values()).map((v) => ({
      [nameHeader]: v.name,
      [emailHeader]: v.email,
      [billingHeader]: v.billing,
      [sumHeader]: v.total,
    }));

    // Sort by sum descending (or by name if ORDER BY donors.display_name was requested and we add it later).
    projectedRows.sort((a: any, b: any) => Number(b[sumHeader] ?? 0) - Number(a[sumHeader] ?? 0));
    const limitedRows = projectedRows.slice(0, parsed.limit);

    const headers = Object.keys(limitedRows[0] ?? { [nameHeader]: "", [emailHeader]: "", [billingHeader]: "", [sumHeader]: 0 });
    const csv = jsonToCsv(limitedRows, headers);
    if (!csv.trim()) {
      return NextResponse.json(
        { error: "Generated CSV is empty. Refusing to save an empty report." },
        { status: 500 }
      );
    }

    const rowCount = limitedRows.length;
    const csvBytes = Buffer.byteLength(csv, "utf8");

    const attempts: Array<Record<string, unknown>> = [
      { organization_id: auth.orgId, title, type: "CSV", content: csv, query: sqlQuery, summary, records_count: rowCount },
      { organization_id: auth.orgId, title, type: "CSV", content: csv, query: sqlQuery, records_count: rowCount },
      {
        organization_id: auth.orgId,
        title,
        filter_criteria: {
          type: "CSV",
          content: csv,
          query: sqlQuery,
          summary,
          row_count: rowCount,
          bytes: csvBytes,
        },
      },
    ];

    let inserted: any = null;
    const errors: string[] = [];
    for (const payload of attempts) {
      const { data: ins, error: insErr } = await supabase
        .from("saved_reports")
        .insert(payload as any)
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
        {
          error:
            "Failed to store report. Your `saved_reports` table schema does not match either supported shape.",
          details: errors,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: String(inserted?.id),
      rowCount,
      bytes: csvBytes,
    });
  }

  // Non-aggregate path (existing behavior)
  if (parsed.table === "donations" && parsed.joinDonors) {
    const parts: string[] = [];
    for (const c of uniqueDonationCols) parts.push(c);
    parts.push(`donors(${Array.from(new Set(uniqueDonorCols)).join(",")})`);
    selectStr = parts.join(",");
  } else {
    selectStr = uniqueDonationCols.join(",") || parsed.select.map((f) => f.col).join(",");
  }

  let q: any = supabase.from(parsed.table).select(selectStr);

  if (parsed.table === "donors") {
    q = q.eq("org_id", auth.orgId);
  } else {
    const { data: orgDonors } = await supabase.from("donors").select("id").eq("org_id", auth.orgId);
    const donorIds = (orgDonors ?? []).map((d: { id: string }) => d.id);
    q = q.in("donor_id", donorIds.length ? donorIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  for (const f of parsed.filters) {
    if (f.op === "eq") q = q.eq(f.col, f.value);
    else if (f.op === "gt") q = q.gt(f.col, f.value);
    else if (f.op === "gte") q = q.gte(f.col, f.value);
    else if (f.op === "lt") q = q.lt(f.col, f.value);
    else if (f.op === "lte") q = q.lte(f.col, f.value);
    else if (f.op === "ilike") q = q.ilike(f.col, f.value);
    else if (f.op === "like") q = q.like(f.col, f.value);
    else if (f.op === "isnull") q = q.is(f.col, null);
    else if (f.op === "notnull") q = q.not(f.col, "is", null);
    else if (f.op === "or") q = q.or(f.expr);
  }

  if (parsed.orderBy) q = q.order(parsed.orderBy.col, { ascending: parsed.orderBy.ascending });
  q = q.limit(parsed.limit);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "Failed to execute report query.", details: error.message },
      { status: 500 }
    );
  }

  const rawRows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];

  // Project into a flat shape with deterministic headers (and avoid nested donors objects in CSV).
  const headers = parsed.select.map((s) => s.header);
  const projectedRows = rawRows.map((r: any) => {
    const out: Record<string, unknown> = {};
    for (const s of parsed.select) {
      if (s.source === "donors") {
        const donorsObj = r?.donors ?? null;
        out[s.header] = donorsObj && typeof donorsObj === "object" ? (donorsObj as any)[s.col] : null;
      } else {
        out[s.header] = r?.[s.col] ?? null;
      }
    }
    return out;
  });

  const csv = jsonToCsv(projectedRows, headers);
  if (!csv.trim()) {
    return NextResponse.json(
      { error: "Generated CSV is empty. Refusing to save an empty report." },
      { status: 500 }
    );
  }
  const csvBytes = Buffer.byteLength(csv, "utf8");
  const rowCount = projectedRows.length;

  // Store into saved_reports.
  // Supports BOTH schemas:
  // - New: saved_reports(title, type, content, query, summary, created_at, ...)
  // - Legacy MVP: saved_reports(title, filter_criteria jsonb, created_at)
  const attempts: Array<Record<string, unknown>> = [
    { organization_id: auth.orgId, title, type: "CSV", content: csv, query: sqlQuery, summary, records_count: rowCount },
    { organization_id: auth.orgId, title, type: "CSV", content: csv, query: sqlQuery, records_count: rowCount },
    {
      organization_id: auth.orgId,
      title,
      filter_criteria: {
        type: "CSV",
        content: csv,
        query: sqlQuery,
        summary,
        row_count: rowCount,
        bytes: csvBytes,
      },
    },
  ];

  let inserted: any = null;
  const errors: string[] = [];

  for (const payload of attempts) {
    const { data: ins, error: insErr } = await supabase
      .from("saved_reports")
      .insert(payload as any)
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
      {
        error:
          "Failed to store report. Your `saved_reports` table schema does not match either supported shape.",
        details: errors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    reportId: String(inserted?.id),
    rowCount,
    bytes: csvBytes,
  });
}

