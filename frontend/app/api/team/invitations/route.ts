import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getCurrentUserOrgWithRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeamActivity } from "@/lib/notifications";

export const runtime = "nodejs";

const INVITE_FROM_EMAIL = "Vantage <invites@vantagedonorai.com>";

export type InvitationResponse = {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
  created_at: string;
};

function canManageTeam(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function GET() {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTeam(ctx.role)) {
    return NextResponse.json([] as InvitationResponse[]);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", ctx.orgId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[team/invitations] GET:", error.message);
    return NextResponse.json({ error: "Failed to load invitations." }, { status: 500 });
  }

  return NextResponse.json((data ?? []) as InvitationResponse[]);
}

export async function POST(request: Request) {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTeam(ctx.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can invite." },
      { status: 403 }
    );
  }

  let body: {
    email?: unknown;
    role?: unknown;
    inviter_name?: unknown;
    app_url?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const role = body.role === "admin" ? "admin" : "member";
  const inviterName =
    typeof body.inviter_name === "string" ? body.inviter_name.trim() : "";
  const clientAppUrl =
    typeof body.app_url === "string" ? body.app_url.trim() : "";

  const supabase = createAdminClient();
  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const { data: inviteRow, error: insertError } = await supabase
    .from("invitations")
    .insert({
      email,
      organization_id: ctx.orgId,
      token,
      role,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, email, role, expires_at, created_at")
    .single();

  if (insertError) {
    console.error("[team/invitations] POST insert:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const baseUrl =
    clientAppUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.vantagedonorai.com";
  const joinPath = `/join?token=${encodeURIComponent(token)}`;
  const link = `${baseUrl.replace(/\/$/, "")}${joinPath}`;

  let emailSent = false;
  let emailError: string | null = null;

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", ctx.orgId)
        .single();
      const orgName = (org as { name?: string } | null)?.name ?? "the team";
      const safeOrgName = orgName
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const safeInviterName = inviterName
        ? inviterName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        : null;
      const safeLink = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
      const invitedByLine = safeInviterName
        ? `<strong>${safeInviterName}</strong> has invited you to join`
        : "You've been invited to join";

      const resend = new Resend(apiKey);
      const { error: sendError } = await resend.emails.send({
        from: INVITE_FROM_EMAIL,
        to: email,
        subject: `${safeInviterName ?? "Your team"} invited you to join ${orgName} on Vantage`,
        html: `
<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 48px 24px;">
  <div style="margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">You're invited</h1>
    <div style="width: 48px; height: 3px; background: linear-gradient(to right, #007A3F, #21E0D6); border-radius: 2px;"></div>
  </div>
  <p style="color: #52525b; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">
    ${invitedByLine} <strong>${safeOrgName}</strong> on Vantage as a <strong>${roleLabel}</strong>.
  </p>
  <p style="color: #52525b; font-size: 15px; line-height: 1.7; margin: 0 0 32px 0;">
    Tap the button below to accept and get started.
  </p>
  <div style="margin: 0 0 32px 0;">
    <a href="${safeLink}" style="display: inline-block; background: linear-gradient(to right, #007A3F, #21E0D6); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px;">Accept Invitation</a>
  </div>
  <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 32px 0;">
    Or copy and paste this link into your browser:<br>
    <span style="color: #007A3F; word-break: break-all;">${safeLink}</span>
  </p>
  <p style="color: #a1a1aa; font-size: 12px; line-height: 1.6; margin: 0 0 32px 0;">
    This invitation expires in 48 hours. If you didn't expect this email, you can safely ignore it.
  </p>
  <p style="color: #a1a1aa; font-size: 13px; margin: 0;">
    — The Vantage Team
  </p>
</div>
        `.trim(),
      });

      if (sendError) {
        emailError = sendError.message;
      } else {
        emailSent = true;
        const actorName = inviterName || "A team member";
        void notifyTeamActivity(
          ctx.orgId,
          actorName,
          "invited a new team member",
          email
        ).catch(console.error);
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
    }
  } else {
    emailError =
      "Email is not configured. Invite link was created — copy and share it manually.";
  }

  return NextResponse.json(
    {
      invitation: inviteRow,
      link,
      email_sent: emailSent,
      email_error: emailError,
    },
    { status: 201 }
  );
}
