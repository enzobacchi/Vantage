"use client"

import * as React from "react"
import { BellRing, Check, CircleCheck, Mail, Phone, Receipt, StickyNote, Users } from "lucide-react"

import { getDonorProfile } from "@/app/donors/[id]/actions"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** Write tools whose two-phase confirm results render as an action card. */
export const ACTION_TOOLS = new Set(["log_interaction", "create_task", "create_donation"])

export type ActionOutput = {
  requires_confirmation?: boolean
  success?: boolean
  action?: string
  preview?: Record<string, unknown>
} & Record<string, unknown>

/** Pull the action fields out of a tool output — previews nest them, results are flat. */
function fieldsOf(output: ActionOutput): Record<string, unknown> {
  return output.requires_confirmation ? (output.preview ?? {}) : output
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

function formatDay(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

const INTERACTION_META: Record<string, { icon: React.ElementType; verb: string; done: string }> = {
  meeting: { icon: Users, verb: "Log visit", done: "Visit logged" },
  call: { icon: Phone, verb: "Log call", done: "Call logged" },
  email: { icon: Mail, verb: "Log email", done: "Email logged" },
  note: { icon: StickyNote, verb: "Add note", done: "Note added" },
}

/**
 * Resolve real donor names from the (org-scoped) profile action rather than
 * trusting the name in the tool output, which can be a privacy placeholder.
 */
function useDonorNames(ids: string[]) {
  const [names, setNames] = React.useState<Record<string, string>>({})
  const key = [...new Set(ids)].sort().join(",")
  React.useEffect(() => {
    if (!key) return
    let cancelled = false
    Promise.all(
      key.split(",").map(async (id) => {
        const result = await getDonorProfile(id).catch(() => null)
        return [id, result?.donor?.display_name ?? ""] as const
      })
    ).then((entries) => {
      if (!cancelled) setNames(Object.fromEntries(entries.filter(([, name]) => name)))
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return names
}

function describe(tool: string, f: Record<string, unknown>, done: boolean, donorName: string) {
  if (tool === "log_interaction") {
    const meta = INTERACTION_META[str(f.type)] ?? INTERACTION_META.note
    return {
      icon: meta.icon,
      title: done ? meta.done : meta.verb,
      meta: [donorName, formatDay(str(f.date))].filter(Boolean).join(" · "),
      body: str(f.content),
    }
  }
  if (tool === "create_task") {
    return {
      icon: BellRing,
      title: done ? `Reminder set: ${str(f.title)}` : `Remind me: ${str(f.title)}`,
      meta: [`Due ${formatDay(str(f.due_date))}`, donorName].filter(Boolean).join(" · "),
      body: str(f.notes),
    }
  }
  const amount = typeof f.amount === "number" ? formatCurrency(f.amount) : ""
  return {
    icon: Receipt,
    title: done ? `Recorded ${amount} gift` : `Record ${amount} gift`,
    meta: [donorName, formatDay(str(f.date)), str(f.payment_method)].filter(Boolean).join(" · "),
    body: str(f.memo),
  }
}

export function ChatActionCard({
  items,
  status,
  onReply,
}: {
  items: { tool: string; output: ActionOutput }[]
  /** "pending" shows Confirm/Cancel; "superseded" is an earlier preview; "done" lists completed writes. */
  status: "pending" | "superseded" | "done"
  onReply?: (text: string) => void
}) {
  const names = useDonorNames(items.map((i) => str(fieldsOf(i.output).donor_id)).filter(Boolean))
  const [replied, setReplied] = React.useState(false)
  const done = status === "done"

  const reply = (text: string) => {
    setReplied(true)
    onReply?.(text)
  }

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border bg-card shadow-sm",
        "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none",
        done ? "border-teal-500/30" : "border-border"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5 text-xs font-medium",
          done
            ? "border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300"
            : "border-border/60 text-muted-foreground"
        )}
      >
        {done ? <CircleCheck className="size-3.5" strokeWidth={1.5} /> : null}
        {done ? "Done" : status === "pending" ? "Ready to save — nothing is written until you confirm" : "Preview"}
      </div>
      <ul className="divide-y divide-border/60">
        {items.map(({ tool, output }, i) => {
          const f = fieldsOf(output)
          const name = names[str(f.donor_id)] ?? ""
          const d = describe(tool, f, done, name)
          const Icon = d.icon
          return (
            <li key={i} className="flex gap-3 px-4 py-3">
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-gradient-to-br from-[#007A3F] to-[#21E0D6] text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={2} /> : <Icon className="size-3.5" strokeWidth={1.5} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{d.title}</p>
                {d.meta && <p className="mt-0.5 text-xs text-muted-foreground">{d.meta}</p>}
                {d.body && (
                  <p className="mt-1.5 line-clamp-3 text-sm text-foreground/80">&ldquo;{d.body}&rdquo;</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {status === "pending" && onReply && (
        <div className="flex justify-end gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={replied}
            onClick={() => reply("Cancel — don't save that.")}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 border-0 bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 text-xs shadow-sm"
            disabled={replied}
            onClick={() => reply("Yes, go ahead.")}
          >
            <Check className="size-3.5" strokeWidth={1.5} />
            Confirm
          </Button>
        </div>
      )}
    </div>
  )
}
