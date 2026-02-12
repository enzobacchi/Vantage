"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsClient() {
  const searchParams = useSearchParams();
  const qbStatus = searchParams.get("qb") ?? undefined;
  const realmId = searchParams.get("realmId") ?? undefined;
  const [syncState, setSyncState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: unknown }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function runSync() {
    try {
      setSyncState({ status: "loading" });
      const url = realmId ? `/api/sync?realmId=${encodeURIComponent(realmId)}` : "/api/sync";
      const res = await fetch(url);
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data
            ? String((data as any).error)
            : `Sync failed (HTTP ${res.status}).`;
        setSyncState({ status: "error", message: msg });
        return;
      }

      setSyncState({ status: "success", data });
    } catch (e) {
      setSyncState({
        status: "error",
        message: e instanceof Error ? e.message : "Sync failed.",
      });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>QuickBooks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {qbStatus === "connected" ? (
              <p className="text-sm text-zinc-700">
                Connected to QuickBooks{realmId ? ` (realmId: ${realmId})` : ""}.
              </p>
            ) : (
              <p className="text-sm text-zinc-700">Not connected.</p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/api/quickbooks">Connect QuickBooks</Link>
              </Button>

              <Button
                variant="outline"
                onClick={runSync}
                disabled={syncState.status === "loading"}
              >
                {syncState.status === "loading" ? "Syncing…" : "Sync donors now"}
              </Button>
            </div>

            {syncState.status === "error" ? (
              <p className="text-sm text-red-600">{syncState.message}</p>
            ) : null}

            {syncState.status === "success" ? (
              <pre className="max-h-64 overflow-auto rounded-md border bg-white p-3 text-xs text-zinc-800">
                {JSON.stringify(syncState.data, null, 2)}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

