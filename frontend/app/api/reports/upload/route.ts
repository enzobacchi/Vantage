import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB

/** Count data rows (excluding header). */
function countCsvRows(csv: string): number {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return 0;
  return lines.length - 1;
}

export async function POST(request: Request) {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    let file: File;
    let titleInput: string | null = null;

    const formData = await request.formData();
    const f = formData.get("file");
    if (!f || !(f instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid file. Upload a CSV file." },
        { status: 400 }
      );
    }
    file = f;
    const t = formData.get("title");
    titleInput = typeof t === "string" ? t.trim() || null : null;

    if (file.size > MAX_CSV_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_CSV_BYTES / 1024 / 1024} MB.` },
        { status: 400 }
      );
    }

    const name = file.name.trim();
    if (!name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "File must be a CSV (.csv)." },
        { status: 400 }
      );
    }

    const csv = await file.text();
    const trimmed = csv.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "File is empty." },
        { status: 400 }
      );
    }

    const rowCount = countCsvRows(trimmed);
    const title =
      titleInput ||
      name.replace(/\.csv$/i, "").replace(/\s+/g, " ").trim() ||
      "Uploaded Report";

    const supabase = createAdminClient();

    // Schema: no filter_criteria column; query is NOT NULL — use empty string.
    const attempts: Array<Record<string, unknown>> = [
      { organization_id: auth.orgId, title, type: "CSV", content: trimmed, query: "", summary: "Uploaded CSV", records_count: rowCount },
      { title, type: "CSV", content: trimmed, query: "", summary: "Uploaded CSV", records_count: rowCount },
    ];

    let inserted: { id?: string } | null = null;
    const errors: string[] = [];

    for (const payload of attempts) {
      const { data, error } = await supabase
        .from("saved_reports")
        .insert(payload as any)
        .select("id")
        .single();
      if (!error) {
        inserted = data;
        break;
      }
      errors.push(error.message);
    }

    if (!inserted?.id) {
      const firstError = errors[0] ?? "Unknown error";
      console.error("[reports/upload] All insert attempts failed:", errors);
      return NextResponse.json(
        { error: firstError, details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: String(inserted.id),
      title,
      rowCount,
    });
  } catch (err) {
    console.error("[reports/upload] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json(
      { error: message, details: [String(err)] },
      { status: 500 }
    );
  }
}
