import OpenAI from "openai";

import { createAdminClient } from "@/lib/supabase/admin";

export type RetrievedDonor = {
  id: string;
  qb_customer_id: string | null;
  display_name: string | null;
  email: string | null;
  billing_address: string | null;
  total_lifetime_value: number | null;
  last_donation_date: string | null;
  similarity?: number | null;
};

export type DonorSearchResult = {
  donors: RetrievedDonor[];
  method: "vector" | "keyword" | "vector+keyword";
  debug: {
    vectorCount: number;
    bestSimilarity: number | null;
    thresholdUsed: number;
  };
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeDonorRow(row: any): RetrievedDonor {
  return {
    id: String(row.id),
    qb_customer_id: typeof row.qb_customer_id === "string" ? row.qb_customer_id : null,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    email: typeof row.email === "string" ? row.email : null,
    billing_address: typeof row.billing_address === "string" ? row.billing_address : null,
    total_lifetime_value: toNumber(row.total_lifetime_value),
    last_donation_date: typeof row.last_donation_date === "string" ? row.last_donation_date : null,
    similarity: toNumber(row.similarity),
  };
}

/**
 * Semantic donor retrieval with keyword fallback.
 * Scoped to orgId so each ministry only sees their donors.
 *
 * - Embeds the query using OpenAI `text-embedding-3-small`
 * - Calls Supabase RPC `match_donors` to retrieve top matches (vector similarity)
 * - If vector search returns nothing (or weak confidence), falls back to ILIKE on `display_name`
 */
export async function searchDonors(query: string, orgId: string): Promise<DonorSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      donors: [],
      method: "keyword",
      debug: { vectorCount: 0, bestSimilarity: null, thresholdUsed: 0 },
    };
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });
  const supabase = createAdminClient();

  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: trimmed,
  });

  const queryEmbedding = embeddingRes.data?.[0]?.embedding;
  if (!queryEmbedding) {
    throw new Error("Failed to generate query embedding.");
  }

  const thresholdUsed = 0.2;
  const { data: vectorData, error: vectorError } = await supabase.rpc("match_donors", {
    query_embedding: queryEmbedding,
    match_threshold: thresholdUsed,
    match_count: 50,
    p_org_id: orgId,
  });

  if (vectorError) {
    throw new Error(`Supabase match_donors failed: ${vectorError.message}`);
  }

  const vectorRows = Array.isArray(vectorData) ? (vectorData as any[]) : [];
  const vectorDonors = vectorRows.slice(0, 5).map(normalizeDonorRow);
  const bestSimilarity =
    vectorDonors.length > 0
      ? Math.max(...vectorDonors.map((d) => (typeof d.similarity === "number" ? d.similarity : 0)))
      : null;

  const lowConfidence = vectorDonors.length === 0 || (bestSimilarity != null && bestSimilarity < 0.25);

  if (!lowConfidence) {
    return {
      donors: vectorDonors,
      method: "vector",
      debug: { vectorCount: vectorDonors.length, bestSimilarity, thresholdUsed },
    };
  }

  const { data: keywordData, error: keywordError } = await supabase
    .from("donors")
    .select("id,qb_customer_id,display_name,email,billing_address,total_lifetime_value,last_donation_date")
    .eq("org_id", orgId)
    .ilike("display_name", `%${trimmed}%`)
    .order("total_lifetime_value", { ascending: false, nullsFirst: false })
    .limit(5);

  if (keywordError) {
    throw new Error(`Keyword donor search failed: ${keywordError.message}`);
  }

  const keywordRows = Array.isArray(keywordData) ? (keywordData as any[]) : [];
  const keywordDonors = keywordRows.map((row) => normalizeDonorRow({ ...row, similarity: null }));

  return {
    donors: keywordDonors.length > 0 ? keywordDonors : vectorDonors,
    method: keywordDonors.length > 0 ? "vector+keyword" : "vector",
    debug: { vectorCount: vectorDonors.length, bestSimilarity, thresholdUsed },
  };
}

