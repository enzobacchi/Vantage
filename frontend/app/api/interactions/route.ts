import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logTouchpoint } from "@/lib/meter/log-touchpoint";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

   
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Clients that predate touchpoint kinds send only `type`; newer ones may
  // send `kind` ("coffee", "text", …), which then decides the type and points.
  const validTypes = ["email", "call", "meeting", "note", "task"] as const;
  const kind = typeof body.kind === "string" && body.kind.trim() ? body.kind.trim() : undefined;
  if (!kind && !validTypes.includes(body.type)) {
    return NextResponse.json({ error: "Invalid interaction type" }, { status: 400 });
  }

  if (!body.donor_id) {
    return NextResponse.json({ error: "donor_id is required" }, { status: 400 });
  }

  const result = await logTouchpoint(createAdminClient(), {
    orgId: auth.orgId,
    userId: auth.userId,
    donorId: body.donor_id,
    kind,
    type: validTypes.includes(body.type) ? body.type : undefined,
    direction: body.direction ?? null,
    subject: body.subject ?? null,
    content: body.content ?? "",
    date: body.date,
    status: body.status,
  });

  if (!result.ok) {
    if (result.reason === "donor_not_found") {
      return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    }
    if (result.reason === "invalid") {
      return NextResponse.json({ error: "Invalid interaction type" }, { status: 400 });
    }
    console.error("[interactions] POST:", result.message);
    return NextResponse.json({ error: "Failed to save interaction." }, { status: 500 });
  }

  return NextResponse.json(result.interaction, { status: 201 });
}
