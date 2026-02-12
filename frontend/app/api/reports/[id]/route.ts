import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  }

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id,title,type,content,summary,created_at")
    .eq("id", id)
    .eq("organization_id", auth.orgId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Missing title." }, { status: 400 });

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .update({ title })
    .eq("id", id)
    .eq("organization_id", auth.orgId)
    .select("id,title,type,summary,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to rename report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, report: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.orgId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

