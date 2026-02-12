import OpenAI from "openai";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return NextResponse.json({ error: "Missing OpenAI API Key" }, { status: 500 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: report, error: reportError } = await supabase
    .from("saved_reports")
    .select("id,title,filter_criteria")
    .eq("id", id)
    .single();

  if (reportError || !report) {
    return NextResponse.json(
      { error: "Report not found.", details: reportError?.message },
      { status: 404 }
    );
  }

  const criteria = report.filter_criteria as any;
  const query =
    typeof criteria?.query === "string"
      ? criteria.query
      : typeof criteria?.keywords === "string"
        ? criteria.keywords
        : report.title;

  const matchThreshold =
    typeof criteria?.match_threshold === "number" ? criteria.match_threshold : 0.1;
  const matchCount = typeof criteria?.match_count === "number" ? criteria.match_count : 20;

  const openai = new OpenAI({ apiKey: openaiApiKey });
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingRes.data?.[0]?.embedding;

  if (!queryEmbedding) {
    return NextResponse.json(
      { error: "Failed to generate embedding for report." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.rpc("match_donors", {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to run report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ donors: Array.isArray(data) ? data : [] });
}

