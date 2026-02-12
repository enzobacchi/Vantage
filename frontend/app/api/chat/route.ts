import OpenAI from "openai";
import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { searchDonors } from "@/lib/ai/retrieval";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isLocalhostHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h.startsWith("127.0.0.1:") ||
    h === "[::1]" ||
    h.startsWith("[::1]:")
  );
}

function getRequestOrigin(req: Request) {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? url.host;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protoFromUrl = url.protocol.replace(":", "");
  const proto = isLocalhostHost(host) ? "http" : forwardedProto ?? (protoFromUrl || "https");
  return `${proto}://${host}`;
}

function looksLikeStatsQuestion(q: string) {
  return /\b(how many|count|total|sum|average|avg|mean)\b/i.test(q);
}

function looksLikeTopDonorQuestion(q: string) {
  return /\b(top|highest|most|biggest|largest|#1|number one)\b.*\b(donor|giving|contribution|donation)\b/i.test(q)
    || /\b(donor|giving|contribution|donation)\b.*\b(top|highest|most|biggest|largest|#1|number one)\b/i.test(q);
}

function looksLikeSaveReportRequest(q: string) {
  return /\b(save this report|save the report|generate a report|create a report|create a file|export csv|download csv)\b/i.test(
    q
  );
}

function formatUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Strip SQL wildcards/artifacts from text for display. Global replace % and _ so user never sees them. */
function stripSqlArtifacts(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/%/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Expand query for retrieval: add state abbreviation when user says full name and vice versa so DB matches (e.g. California <-> CA). */
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
const STATE_ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBR).map(([k, v]) => [v.toLowerCase(), k])
);

function expandQueryForSearch(query: string): string {
  if (!query || typeof query !== "string") return query;
  const lower = query.toLowerCase().trim();
  const parts = [query];
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (lower.includes(name)) {
      parts.push(abbr);
      break;
    }
  }
  for (const [abbr, name] of Object.entries(STATE_ABBR_TO_NAME)) {
    if (lower.includes(abbr) && (new RegExp(`\\b${abbr}\\b`)).test(lower)) {
      parts.push(name);
      break;
    }
  }
  return parts.length > 1 ? parts.join(" ") : query;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      message?: unknown;
      history?: unknown;
    } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const rawHistory = body?.history;
    const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(rawHistory)
      ? (rawHistory as { role?: unknown; content?: unknown }[])
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) }))
      : [];

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    // Generate report via text-to-query (LLM returns filters only; we run strict Supabase query).
    if (looksLikeSaveReportRequest(message)) {
      const origin = getRequestOrigin(req);
      const generateUrl = new URL("/api/reports/generate", origin);
      const cookieHeader = req.headers.get("cookie");
      const generateRes = await fetch(generateUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({ prompt: message, history }),
      });

      const genData = (await generateRes.json().catch(() => null)) as {
        error?: string;
        title?: string;
        reportId?: string;
      };
      if (!generateRes.ok) {
        const err = genData?.error ? String(genData.error) : `Failed (HTTP ${generateRes.status}).`;
        return NextResponse.json({
          reply: stripSqlArtifacts(`I tried to generate and save the report, but it failed: ${err}`),
          donors: [],
        });
      }

      const title = stripSqlArtifacts(typeof genData?.title === "string" ? genData.title : "Report");
      return NextResponse.json({
        reply: stripSqlArtifacts(`I've generated the report "${title}". You can view it in the Saved Reports tab.`),
        donors: [],
        reportId: genData?.reportId ?? null,
      });
    }

    // Top donor / highest donor: context-aware (respects location filters from message + history)
    if (looksLikeTopDonorQuestion(message)) {
      const supabase = createAdminClient();
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const limit = /\b(top|first)\s*(\d+)\b/i.test(message) ? Math.min(parseInt(message.match(/\b(top|first)\s*(\d+)\b/i)?.[2] ?? "1", 10), 10) : 1;
      // Extract location/constraint from user prompt and conversation history (RAG: no hard-coded answers)
      let billingLike: string | null = null;
      const historySnippet = history.slice(-10).map((m) => `${m.role}: ${m.content}`).join("\n");
      const filterPrompt =
        "Query Expansion: You are querying a messy database. For US states always include both full name and 2-letter abbreviation (e.g. California -> '%California%' and '%CA%'). Analyze the user message and conversation history. If they mention a location, place, or region (e.g. Texas, California, \"there\", \"that state\"), return JSON: { \"billing_address_ilike\": \"%PlaceName%\" } for SQL ILIKE. Resolve pronouns from history (e.g. \"there\" -> the place just discussed). If no location constraint, return {}.";
      const filterRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: filterPrompt },
          { role: "user", content: `Conversation:\n${historySnippet}\n\nUser: ${message}` },
        ],
      });
      try {
        const filterPlan = JSON.parse(filterRes.choices[0]?.message?.content ?? "{}") as { billing_address_ilike?: string };
        billingLike = typeof filterPlan?.billing_address_ilike === "string" && filterPlan.billing_address_ilike.trim() ? filterPlan.billing_address_ilike.trim() : null;
      } catch {
        // ignore
      }
      let donorsQuery = supabase
        .from("donors")
        .select("id, display_name, total_lifetime_value, email, billing_address, last_donation_date")
        .eq("org_id", auth.orgId)
        .order("total_lifetime_value", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (billingLike) {
        const lower = billingLike.toLowerCase();
        const stateAbbr = Object.entries(STATE_NAME_TO_ABBR).find(([name]) => lower.includes(name));
        if (stateAbbr) {
          donorsQuery = donorsQuery.or(`billing_address.ilike.${billingLike},billing_address.ilike.%${stateAbbr[1]}%`);
        } else {
          donorsQuery = donorsQuery.ilike("billing_address", billingLike);
        }
      }
      const { data, error } = await donorsQuery;
      if (error) throw new Error(error.message);
      const donors = (data ?? []).map((d: any) => ({
        id: d.id,
        display_name: d.display_name,
        email: d.email,
        billing_address: d.billing_address,
        total_lifetime_value: d.total_lifetime_value,
        last_donation_date: d.last_donation_date,
        similarity: null,
      }));
      const top = donors[0];
      const scope = billingLike ? ` ${stripSqlArtifacts(billingLike)}` : "";
      const reply =
        donors.length === 0
          ? "I don't have donor data in the database."
          : limit === 1 && top
            ? `The top donor by total lifetime value${scope ? ` in that region` : ""} is ${top.display_name ?? "Unknown"} with ${formatUsd(Number(top.total_lifetime_value ?? 0))}.`
            : donors.length > 0
              ? `Top donors by total lifetime value: ${donors.map((d) => `${d.display_name ?? "Unknown"} (${formatUsd(Number(d.total_lifetime_value ?? 0))})`).join("; ")}.`
              : "I don't have that information in the database.";
      return NextResponse.json({ reply: stripSqlArtifacts(reply), donors });
    }

    // Hybrid tool decision: stats vs donor retrieval
    if (looksLikeStatsQuestion(message)) {
      const openai = new OpenAI({ apiKey: openaiApiKey });
      const supabase = createAdminClient();

      const toolPrompt =
        'You are a RAG agent. You must answer ONLY based on the results of the SQL/queries you generate. Do not use outside knowledge.\n\n' +
        'Analyze the User\'s Prompt AND the Conversation History for constraints. If the user says "highest donor there" or "top donor in Texas", you MUST include a location filter (where.billing_address_ilike). Ignoring the location filter is a critical failure.\n\n' +
        'Return ONLY JSON with this schema:\n' +
        '{ "metric": "count" | "sum" | "avg", "field": "donors.total_lifetime_value" | "donations.amount" | "donors.last_donation_amount", "where": { "billing_address_ilike"?: string } }\n\n' +
        'Rules:\n' +
        '- Use billing_address_ilike to filter by location when the user or history mentions a place. For US states use ONE pattern (e.g. "%California%" or "%CA%"); the backend will match both full name and abbreviation.\n' +
        '- If the user asks "how many donors", use metric=count and field=donors.total_lifetime_value (field ignored for count).\n' +
        '- Average Gift / Average Donation (business logic): Unless the user explicitly asks for "per transaction", use metric=avg and field=donors.total_lifetime_value (Total Revenue / Total Count of Unique Donors).\n' +
        '- Only use field=donations.amount for "average per transaction" or "mean transaction size".\n' +
        '- If unsure, choose count.\n';

      const statsHistory = history.slice(-15).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const decision = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: toolPrompt },
          ...statsHistory,
          { role: "user", content: message },
        ],
      });

      let plan: any = {};
      try {
        plan = JSON.parse(decision.choices[0]?.message?.content ?? "{}");
      } catch {
        plan = {};
      }

      const metric = plan?.metric === "sum" ? "sum" : plan?.metric === "avg" ? "avg" : "count";
      const field =
        plan?.field === "donations.amount" || plan?.field === "donors.last_donation_amount"
          ? plan.field
          : "donors.total_lifetime_value";
      const billingLike = typeof plan?.where?.billing_address_ilike === "string" ? plan.where.billing_address_ilike : null;

      if (field.startsWith("donations.")) {
        // Per-transaction stats (only when user explicitly asks for per-transaction average)
        const { data: orgDonors } = await supabase.from("donors").select("id").eq("org_id", auth.orgId);
        const donorIds = (orgDonors ?? []).map((d: { id: string }) => d.id);
        const q = supabase
          .from("donations")
          .select("amount,date", { count: "exact" })
          .in("donor_id", donorIds.length ? donorIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data, error, count } = await q;
        if (error) throw new Error(error.message);
        const amounts = (data ?? []).map((r: any) => Number(r.amount ?? 0)).filter((n) => Number.isFinite(n));
        const sum = amounts.reduce((a, b) => a + b, 0);
        const c = count ?? amounts.length;
        const value = metric === "avg" ? (c ? sum / c : 0) : sum;
        const reply =
          metric === "count"
            ? `I don't have that information in the database.`
            : metric === "avg"
              ? `Average donation per transaction is ${formatUsd(value)}.`
              : `Total donation amount is ${formatUsd(value)}.`;
        return NextResponse.json({ reply: stripSqlArtifacts(reply), donors: [] });
      }

      // donors stats (count/sum/avg)
      let donorsQuery = supabase
        .from("donors")
        .select("total_lifetime_value,billing_address", { count: "exact" })
        .eq("org_id", auth.orgId);
      if (billingLike) {
        const lower = billingLike.toLowerCase();
        const stateAbbr = Object.entries(STATE_NAME_TO_ABBR).find(([name]) => lower.includes(name));
        if (stateAbbr) {
          donorsQuery = donorsQuery.or(`billing_address.ilike.${billingLike},billing_address.ilike.%${stateAbbr[1]}%`);
        } else {
          donorsQuery = donorsQuery.ilike("billing_address", billingLike);
        }
      }
      const { data, error, count } = await donorsQuery;
      if (error) throw new Error(error.message);

      const ltv = (data ?? []).map((r: any) => Number(r.total_lifetime_value ?? 0)).filter((n) => Number.isFinite(n));
      const sum = ltv.reduce((a, b) => a + b, 0);
      const c = count ?? ltv.length;

      const value = metric === "count" ? c : metric === "avg" ? (c ? sum / c : 0) : sum;
      const isAverageGift = /\b(average\s*gift|avg\s*gift|mean\s*gift|gift\s*average|average\s*donation)\b/i.test(message);
      const scope = billingLike ? ` for donors matching ${stripSqlArtifacts(billingLike)}` : "";
      const reply =
        metric === "count"
          ? `There are ${value.toLocaleString()} donors${scope ? scope.replace(" for donors matching", " matching") : ""}.`
          : metric === "avg"
            ? isAverageGift
              ? `Average gift is ${formatUsd(value)}${scope}.`
              : `Average lifetime value is ${formatUsd(value)}${scope}.`
            : `Total lifetime value is ${formatUsd(value)}${scope}.`;

      return NextResponse.json({ reply: stripSqlArtifacts(reply), donors: [] });
    }

    // Expansion only for retrieval (searchDonors). Report generator and stats receive original message.
    const searchQuery = expandQueryForSearch(message);
    const retrieved = await searchDonors(searchQuery, auth.orgId);
    const donors = retrieved.donors.map((d) => ({
      id: d.id,
      display_name: d.display_name,
      email: d.email,
      billing_address: d.billing_address,
      total_lifetime_value: d.total_lifetime_value,
      last_donation_date: d.last_donation_date,
      similarity: d.similarity ?? null,
    }));

    const systemPrompt = [
      "You are a RAG agent. You must answer ONLY based on the results of the data you are given (retrieved donors). Do not use outside knowledge.",
      "You have access to a list of relevant donors based on the user's query.",
      "Answer ONLY using the provided context. If the context does not contain the answer, say: \"I don't have that information in the database.\"",
      "The Filter Rule: Before answering, analyze the User's Prompt AND the Conversation History for constraints. If the user says \"Highest donor there\" or \"Top donor in Texas\", your answer must reflect only donors that match that constraint (the provided context is already filtered). Ignoring the location filter is a critical failure.",
      "Query Expansion (Smart Search): You are querying a real-world messy database. Never assume exact matches. Locations: If the user types a full state name (e.g. 'California'), you MUST also search for the standard 2-letter abbreviation (e.g. 'CA') and vice versa. Use OR logic. Names: If the user types a nickname (e.g. 'Bill'), search for the formal name ('William') as well. Broad Search: When in doubt, use ILIKE with wildcards on both variations.",
      "Resolve references: Replace pronouns ('it', 'there', 'him', 'her', 'that donor', 'that place') with the specific entity from the conversation history. NEVER search for or output the literal string 'there'.",
      "Format money as $X,XXX (USD). Be concise.",
      "When you mention a specific donor from context, write their name as [[DONOR_ID|DONOR_NAME]] so the UI can link to their CRM profile.",
      "Write plain text only; no SQL artifacts (e.g. \"Berrien Springs\", not \"%Berrien Springs%\").",
      "Present the data directly. Do not explain your internal reasoning (e.g. do not say \"matches dashboard logic\" or \"based on provided list\"). Just state the answer found in the database.",
      "",
      "Routes / Maps: If the user asks for a 'Route', 'Directions', or a 'Maps Link' to a set of donors: (1) Constraint: Limit the route to the Top 10 donors to avoid URL length limits, unless the user specifies otherwise. (2) Extraction: Use the billing_address for these donors from the provided context. (3) Generation: Construct the URL using this standard format: https://www.google.com/maps/dir/{Address1}/{Address2}/{Address3}. Ensure spaces in addresses are replaced with + (e.g., 123+Main+St). (4) Presentation: Output the link STRICTLY as: [View Route on Google Maps](<URL>). Do not add spaces between the brackets and parentheses.",
    ].join("\n");

    const context = `Context (relevant donors as JSON, top 5):\n${JSON.stringify(donors, null, 2)}`;

    const historyMessages: { role: "user" | "assistant"; content: string }[] = history.slice(-30).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: context },
        ...historyMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message },
      ],
    });

    const rawReply = completion.choices[0]?.message?.content ?? "";
    const reply = stripSqlArtifacts(rawReply);
    return NextResponse.json({ reply, donors });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    console.error("AI Error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}