import { NextResponse } from "next/server";

import { getCurrentUserOrgWithRole } from "@/lib/auth";

export const runtime = "nodejs";

export type TeamPermissionsResponse = {
  user_id: string;
  role: "owner" | "admin" | "member";
  can_manage: boolean;
  can_change_roles: boolean;
};

export async function GET() {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response: TeamPermissionsResponse = {
    user_id: ctx.userId,
    role: ctx.role as "owner" | "admin" | "member",
    can_manage: ctx.role === "owner" || ctx.role === "admin",
    can_change_roles: ctx.role === "owner",
  };
  return NextResponse.json(response);
}
