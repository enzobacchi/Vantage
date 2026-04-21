import { NextResponse } from "next/server";

import { getCurrentUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BOOLEAN_FIELDS = [
  "email_new_donation",
  "email_donor_milestone",
  "email_weekly_digest",
  "email_team_activity",
  "email_system_alerts",
  "inapp_new_donation",
  "inapp_task_reminders",
  "inapp_donor_lapsed",
] as const;

type PrefField = (typeof BOOLEAN_FIELDS)[number];

export type NotificationPreferencesResponse = Record<PrefField, boolean> & {
  id: string;
  org_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const ctx = await getCurrentUserOrg();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: existing, error: readError } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (readError) {
    console.error("[notifications/preferences] GET:", readError.message);
    return NextResponse.json({ error: "Failed to load preferences." }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(existing);
  }

  const { data: created, error: insertError } = await supabase
    .from("notification_preferences")
    .insert({ org_id: ctx.orgId, user_id: ctx.userId })
    .select("*")
    .single();

  if (insertError) {
    console.error("[notifications/preferences] INSERT defaults:", insertError.message);
    return NextResponse.json({ error: "Failed to create preferences." }, { status: 500 });
  }

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const ctx = await getCurrentUserOrg();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const update: Record<string, boolean> = {};
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (typeof value !== "boolean") {
      return NextResponse.json(
        { error: `${field} must be a boolean.` },
        { status: 400 }
      );
    }
    update[field] = value;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        org_id: ctx.orgId,
        user_id: ctx.userId,
        ...update,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,user_id" }
    );

  if (error) {
    console.error("[notifications/preferences] PATCH:", error.message);
    return NextResponse.json({ error: "Failed to update preferences." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
