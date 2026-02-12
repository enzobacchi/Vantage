"use client";

import { useMemo, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

type RouteCardPayload = {
  type: "route_card";
  url: string;
  donors: string[];
  message: string;
};

function tryParseRouteCard(text: string): RouteCardPayload | null {
  try {
    const obj = JSON.parse(text) as RouteCardPayload;
    if (obj && obj.type === "route_card" && typeof obj.url === "string") return obj;
    return null;
  } catch {
    return null;
  }
}

type ReportCardPayload = {
  type: "report_card";
  title?: string;
  filter_criteria?: Record<string, unknown>;
  donors: Array<{
    id: string;
    display_name: string | null;
    billing_address: string | null;
    total_lifetime_value: number | null;
    last_donation_date: string | null;
  }>;
  message: string;
};

function tryParseReportCard(text: string): ReportCardPayload | null {
  try {
    const obj = JSON.parse(text) as ReportCardPayload;
    if (obj && obj.type === "report_card" && Array.isArray(obj.donors)) return obj;
    return null;
  } catch {
    return null;
  }
}

function SaveReportButton({
  title,
  filter_criteria,
}: {
  title: string;
  filter_criteria: Record<string, unknown>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    try {
      setState("saving");
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, filter_criteria }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as any;
        throw new Error(json?.error ?? "Failed to save report.");
      }
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={save}
      disabled={state === "saving" || state === "saved"}
    >
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : state === "error"
            ? "Save failed (retry)"
            : "Save to Reports"}
    </Button>
  );
}

function toCsvValue(v: unknown) {
  const s = v == null ? "" : String(v);
  // Escape quotes and wrap in quotes if needed.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function donorsToCsv(donors: ReportCardPayload["donors"]) {
  const headers = ["Name", "LTV", "Last Gift", "Address"];
  const rows = donors.map((d) => [
    d.display_name ?? "",
    d.total_lifetime_value ?? "",
    d.last_donation_date ?? "",
    d.billing_address ?? "",
  ]);
  return [headers, ...rows].map((r) => r.map(toCsvValue).join(",")).join("\n");
}

function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ChatPage() {
  const transport = useMemo(() => new TextStreamChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status } = useChat({ transport });

  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>MissionMind Chat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[55vh] overflow-auto rounded-md border bg-white p-4">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Ask something like “Who are my top donors in Florida?”
                  </p>
                ) : null}

                {messages.map((m) => (
                  <div key={m.id} className="text-sm">
                    <div className="font-medium">
                      {m.role === "user" ? "You" : "Assistant"}
                    </div>
                    {(() => {
                      const text = getMessageText(m);
                      const routeCard = m.role === "assistant" ? tryParseRouteCard(text) : null;
                      const reportCard = m.role === "assistant" ? tryParseReportCard(text) : null;

                      if (routeCard) {
                        return (
                          <div className="space-y-2">
                            <div className="whitespace-pre-wrap text-zinc-800">
                              {routeCard.message}
                            </div>
                            <Button asChild className="bg-blue-600 hover:bg-blue-700">
                              <a href={routeCard.url} target="_blank" rel="noreferrer">
                                📍 Open Route in Google Maps
                              </a>
                            </Button>
                          </div>
                        );
                      }

                      if (reportCard) {
                        const title =
                          typeof reportCard.title === "string" && reportCard.title.trim()
                            ? reportCard.title.trim()
                            : "Donor Report";
                        const filter_criteria =
                          reportCard.filter_criteria && typeof reportCard.filter_criteria === "object"
                            ? reportCard.filter_criteria
                            : { query: text };

                        return (
                          <div className="space-y-2">
                            <div className="whitespace-pre-wrap text-zinc-800">{reportCard.message}</div>
                            <Card className="border border-blue-200 bg-blue-50">
                              <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm">Report Ready</CardTitle>
                              </CardHeader>
                              <CardContent className="p-3 pt-2 space-y-2">
                                <div className="text-xs text-zinc-700">
                                  Found <span className="font-medium">{reportCard.donors.length}</span>{" "}
                                  donors.
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    className="bg-blue-600 hover:bg-blue-700"
                                    onClick={() => {
                                      const csv = donorsToCsv(reportCard.donors);
                                      downloadTextFile("donor_report.csv", csv);
                                    }}
                                  >
                                    Download CSV
                                  </Button>
                                  <SaveReportButton title={title} filter_criteria={filter_criteria} />
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        );
                      }

                      return (
                        <div className="whitespace-pre-wrap text-zinc-800">
                          {text}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about your donors…"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

