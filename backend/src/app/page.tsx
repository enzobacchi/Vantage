import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">MissionMind Dashboard</h1>
          <p className="text-sm text-zinc-600">
            Talk to your donor database and manage your data connections.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Link href="/chat" className="group">
            <Card className="h-full cursor-pointer transition-colors group-hover:border-zinc-900">
              <CardHeader>
                <CardTitle>Donor Intelligence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Ask natural-language questions about your donors and gifts.
                </p>
                <p className="text-xs text-zinc-500">
                  Powered by OpenAI and Supabase vector search.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/settings" className="group">
            <Card className="h-full cursor-pointer transition-colors group-hover:border-zinc-900">
              <CardHeader>
                <CardTitle>Data Connections</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Connect QuickBooks and manage sync settings for your donor data.
                </p>
                <p className="text-xs text-zinc-500">
                  Configure integrations and trigger manual syncs.
                </p>
              </CardContent>
            </Card>
          </Link>
        </section>
      </main>
    </div>
  );
}
