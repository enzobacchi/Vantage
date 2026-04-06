import type { PledgeFrequency } from "@/lib/pledge-constants"

export function formatFrequency(freq: PledgeFrequency): string {
  switch (freq) {
    case "one_time": return "One-time"
    case "monthly": return "Monthly"
    case "quarterly": return "Quarterly"
    case "annual": return "Annual"
  }
}

export function getPledgeProgress(pledge: { amount: number; amount_received?: number }): number {
  if (!pledge.amount || pledge.amount <= 0) return 0
  const received = pledge.amount_received ?? 0
  return Math.min(100, Math.round((received / pledge.amount) * 100))
}
