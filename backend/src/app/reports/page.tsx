import { createAdminClient } from "@/lib/supabase/admin";
import ReportsClient from "./ReportsClient";

export const runtime = "nodejs";

export default async function ReportsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("saved_reports")
    .select("id,title,filter_criteria,created_at")
    .order("created_at", { ascending: false });

  return <ReportsClient initialReports={data ?? []} />;
}

