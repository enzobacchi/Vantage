import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ChatHistoryRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  session_id?: string | null;
};

function isMissingColumnError(message: string) {
  return message.includes("does not exist");
}

function asIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const supabase = createAdminClient();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const sessionIdParam = url.searchParams.get("session_id");

  // If session_id exists, include it. If not, fall back gracefully.
  const baseSelect = "id,role,content,created_at,session_id";
  let selectCols = baseSelect;
  const probe = await supabase.from("chat_history").select(selectCols).limit(1);
  if (probe.error && isMissingColumnError(probe.error.message)) {
    selectCols = "id,role,content,created_at";
  }

  // Mode: sessions list (last 50 distinct sessions)
  if (mode === "sessions") {
    const { data, error } = await supabase
      .from("chat_history")
      .select(selectCols)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load chat sessions.", details: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as any[];

    // If no session_id column, use date-based sessions: day:YYYY-MM-DD
    const hasSessionId = selectCols.includes("session_id");

    const seen = new Set<string>();
    const sessions: Array<{ session_id: string; title: string; last_message_at: string }> = [];

    for (const r of rows) {
      const createdAt = typeof r.created_at === "string" ? r.created_at : new Date().toISOString();
      const key = hasSessionId
        ? (typeof r.session_id === "string" && r.session_id ? r.session_id : "unknown")
        : `day:${createdAt.slice(0, 10)}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // title: most recent user message in this session/day (fallback to snippet)
      const title =
        r.role === "user" && typeof r.content === "string"
          ? r.content.slice(0, 60)
          : key;

      sessions.push({ session_id: key, title, last_message_at: createdAt });
      if (sessions.length >= 50) break;
    }

    return NextResponse.json({ sessions, hasSessionId });
  }

  // Mode: fetch messages for a given session_id (or day grouping)
  if (sessionIdParam) {
    const hasSessionId = selectCols.includes("session_id");
    let q = supabase.from("chat_history").select(selectCols).order("created_at", { ascending: true });

    if (hasSessionId && !sessionIdParam.startsWith("day:")) {
      q = q.eq("session_id", sessionIdParam);
    } else if (sessionIdParam.startsWith("day:")) {
      const day = sessionIdParam.slice(4);
      // day is YYYY-MM-DD
      const start = day;
      const next = (() => {
        const d = new Date(`${day}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        return asIsoDate(d);
      })();
      q = q.gte("created_at", `${start}T00:00:00Z`).lt("created_at", `${next}T00:00:00Z`);
    }

    const { data, error } = await q.limit(200);
    if (error) {
      return NextResponse.json(
        { error: "Failed to load chat session.", details: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as any[];
    const normalized: ChatHistoryRow[] = rows.map((r) => ({
      id: String(r.id),
      role: (r.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: typeof r.content === "string" ? r.content : "",
      created_at: typeof r.created_at === "string" ? r.created_at : new Date().toISOString(),
      session_id: typeof r.session_id === "string" ? r.session_id : null,
    }));

    return NextResponse.json({ session_id: sessionIdParam, messages: normalized });
  }

  // Default: last 50 messages (oldest -> newest)
  const { data, error } = await supabase
    .from("chat_history")
    .select(selectCols)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load chat history.", details: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as any[];
  const normalized: ChatHistoryRow[] = rows
    .map((r) => ({
      id: String(r.id),
      role: (r.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: typeof r.content === "string" ? r.content : "",
      created_at: typeof r.created_at === "string" ? r.created_at : new Date().toISOString(),
      session_id: typeof r.session_id === "string" ? r.session_id : null,
    }))
    .reverse();

  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { role?: unknown; content?: unknown; session_id?: unknown }
    | null;

  const role = body?.role === "assistant" ? "assistant" : body?.role === "user" ? "user" : null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const session_id = typeof body?.session_id === "string" ? body.session_id.trim() : "";

  if (!role || !content) {
    return NextResponse.json({ error: "Missing role or content." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const payloadWithSession: any = session_id ? { role, content, session_id } : { role, content };
  const tryWithSession = await supabase
    .from("chat_history")
    .insert(payloadWithSession)
    .select("id,role,content,created_at")
    .single();

  const data = tryWithSession.data;
  const error = tryWithSession.error;

  // If session_id column doesn't exist, retry without it.
  if (error && session_id && isMissingColumnError(error.message)) {
    const retry = await supabase
      .from("chat_history")
      .insert({ role, content })
      .select("id,role,content,created_at")
      .single();

    if (retry.error) {
      return NextResponse.json(
        { error: "Failed to save chat message.", details: retry.error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(retry.data);
  }

  if (error) {
    return NextResponse.json(
      { error: "Failed to save chat message.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

