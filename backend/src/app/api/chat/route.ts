import OpenAI from "openai";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouterResult =
  | { action: "search"; keywords: string }
  | { action: "chat"; keywords: string }
  | { action: "route"; keywords: string; location_context: string }
  | { action: "report"; keywords: string; location_context?: string };

type RouteCardPayload = {
  type: "route_card";
  url: string;
  donors: string[];
  message: string;
};

type ReportCardPayload = {
  type: "report_card";
  title: string;
  filter_criteria: Record<string, unknown>;
  donors: Array<{
    id: string;
    display_name: string | null;
    billing_address: string | null;
    total_lifetime_value: number | null;
    last_donation_date: string | null;
  }>;
  message: string;
};

function getLastUserText(messages: Array<{ role: string; content?: unknown; parts?: unknown }>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;

    // Legacy format: { role, content: string }
    if (typeof m.content === "string") return m.content;

    // AI SDK UIMessage format: { role, parts: [{ type: "text", text: "..." }, ...] }
    if (Array.isArray(m.parts)) {
      const text = m.parts
        .filter((p: any) => p?.type === "text")
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("");
      if (text) return text;
    }
  }
  return "";
}

export async function POST(request: Request) {
  console.log("[/api/chat] start");

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("Missing OpenAI API Key");
    }

    const body = (await request.json().catch(() => null)) as
      | { messages?: Array<{ role: string; content?: unknown; parts?: unknown }> }
      | null;

    const incomingMessages = body?.messages ?? [];
    const userQuery = getLastUserText(incomingMessages);
    if (!userQuery) {
      console.log("[/api/chat] missing user message", {
        messagesCount: incomingMessages.length,
      });
      return NextResponse.json({ error: "Missing user message." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const supabase = createAdminClient();

    // Step 1: Router
    const routerCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a router. Decide what the user wants.\n\nReturn JSON with one of these actions:\n- {"action":"route","keywords":"...","location_context":"..."} if the user asks for route/visit/trip/directions.\n- {"action":"report","keywords":"...","location_context":"..."} if the user asks for a report/CSV/download/list.\n- {"action":"search","keywords":"..."} if the user needs a donor database lookup.\n- {"action":"chat","keywords":"..."} otherwise.\n\nRules:\n- Trigger "route" if the user asks for "route", "visit", "trip", or "directions".\n- Trigger "report" if the user asks for "report", "csv", "download", or "list".\n- For "route" and "report", extract a city/state/area into location_context when possible (e.g. "Orlando", "Texas").\n- keywords should be a short phrase useful for searching.\n',
        },
        { role: "user", content: userQuery },
      ],
    });

    let routed: RouterResult = { action: "chat", keywords: "" };
    try {
      const content = routerCompletion.choices[0]?.message?.content ?? "{}";
      routed = JSON.parse(content) as RouterResult;
    } catch {
      routed = { action: "chat", keywords: "" };
    }

    console.log("[/api/chat] router result", routed);

    // Step 2b: Route intent (Phase 4 Feature E)
    if (routed.action === "route") {
      // Semantic retrieval: embed the full user query and use vector search.
      const embeddingRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: userQuery,
      });
      const queryEmbedding = embeddingRes.data?.[0]?.embedding;

      if (!queryEmbedding) {
        throw new Error("Failed to generate query embedding for route planning.");
      }

      const { data, error } = await supabase.rpc("match_donors", {
        query_embedding: queryEmbedding,
        // Keep this loose while proving end-to-end "route via vectors" flow.
        match_threshold: 0.1,
        match_count: 20,
      });

      if (error) {
        throw new Error(`Supabase match_donors failed: ${error.message}`);
      }

      const rows = Array.isArray(data) ? (data as any[]) : [];
      console.log("[/api/chat] route retrieval done", { donorsFound: rows.length });

      // Pick top 5 by LTV among retrieved matches, with usable addresses.
      const top = rows
        .filter((d) => typeof d?.billing_address === "string" && d.billing_address.trim().length > 0)
        .sort((a, b) => (Number(b?.total_lifetime_value ?? 0) || 0) - (Number(a?.total_lifetime_value ?? 0) || 0))
        .slice(0, 5);

      const stops = top.map((d) => String(d.billing_address));
      const donors = top
        .map((d) => (typeof d?.display_name === "string" ? d.display_name : null))
        .filter((n): n is string => !!n && n.trim().length > 0);

      const url =
        stops.length > 0
          ? `https://www.google.com/maps/dir/${["Current+Location", ...stops]
              .map((s) => encodeURIComponent(s))
              .join("/")}`
          : "https://www.google.com/maps/dir/Current+Location";

      const payload: RouteCardPayload = {
        type: "route_card",
        url,
        donors,
        message:
          stops.length > 0
            ? "Here is a suggested route to visit your top matching donors."
            : "I couldn’t find any donors with enough location data to build a route.",
      };

      console.log("[/api/chat] responding route_card", { stops: stops.length });

      return new NextResponse(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Step 2c: Report intent (Phase 4 Feature D)
    if (routed.action === "report") {
      const embeddingRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: userQuery,
      });
      const queryEmbedding = embeddingRes.data?.[0]?.embedding;

      if (!queryEmbedding) {
        throw new Error("Failed to generate query embedding for report.");
      }

      const { data, error } = await supabase.rpc("match_donors", {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: 20,
      });

      if (error) {
        throw new Error(`Supabase match_donors failed: ${error.message}`);
      }

      const rows = Array.isArray(data) ? (data as any[]) : [];
      console.log("[/api/chat] report retrieval done", { donorsFound: rows.length });

      const locationContext =
        typeof (routed as any).location_context === "string" ? (routed as any).location_context : "";
      const keywords = typeof routed.keywords === "string" ? routed.keywords : "";
      const title =
        (locationContext && `${locationContext} Donors`) ||
        (keywords && `${keywords} Donors`) ||
        "Donor Report";

      const donors = rows.map((d) => ({
        id: String(d.id),
        display_name: typeof d.display_name === "string" ? d.display_name : null,
        billing_address: typeof d.billing_address === "string" ? d.billing_address : null,
        total_lifetime_value:
          typeof d.total_lifetime_value === "number"
            ? d.total_lifetime_value
            : d.total_lifetime_value != null
              ? Number(d.total_lifetime_value)
              : null,
        last_donation_date: typeof d.last_donation_date === "string" ? d.last_donation_date : null,
      }));

      const filter_criteria: Record<string, unknown> = {
        query: userQuery,
        keywords,
        location_context: locationContext || null,
        match_threshold: 0.1,
        match_count: 20,
      };

      const payload: ReportCardPayload = {
        type: "report_card",
        title,
        filter_criteria,
        donors,
        message: `I found ${donors.length} donors matching your criteria.`,
      };

      console.log("[/api/chat] responding report_card", { donors: donors.length });

      return new NextResponse(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // Step 2: Retrieval (optional)
    let donorRows: unknown[] = [];
    if (routed.action === "search") {
      const keywords = typeof routed.keywords === "string" ? routed.keywords : userQuery;
      const embeddingRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: keywords,
      });
      const queryEmbedding = embeddingRes.data?.[0]?.embedding;

      if (queryEmbedding) {
        const { data, error } = await supabase.rpc("match_donors", {
          query_embedding: queryEmbedding,
          // Temporarily loose threshold to prove end-to-end flow.
          match_threshold: 0.1,
          match_count: 8,
        });

        if (!error && Array.isArray(data)) donorRows = data;
      }
    }

    console.log("[/api/chat] retrieval done", { donorsFound: donorRows.length });

    const systemContext =
      donorRows.length > 0
        ? `Database context (matching donors rows as JSON):\n${JSON.stringify(donorRows, null, 2)}`
        : "Database context: No matching donors found (or search not required).";

    // Step 3: Answer
    const answerCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are MissionMind, a donor intelligence assistant. Answer the user using ONLY the database context when provided. If context is empty, say you don't have enough data.",
        },
        { role: "system", content: systemContext },
        { role: "user", content: userQuery },
      ],
    });

    const answer = answerCompletion.choices[0]?.message?.content ?? "";

    console.log("[/api/chat] responding", {
      action: routed.action,
      answerChars: answer.length,
    });

    // Return plain text to avoid the UI rendering raw JSON.
    return new NextResponse(answer, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.log("[/api/chat] error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

