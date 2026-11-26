import { z } from "zod"

import type { AskOutcome } from "./rules"

/**
 * Validation for meter input that arrives from the browser. Server action
 * arguments are attacker-controlled at runtime whatever their TypeScript type,
 * so only the fields named here survive — an extra `orgId` or `userId` in the
 * payload is dropped rather than passed on.
 */

const money = z.number().finite().min(0).max(1_000_000_000)

const gaveFull = z.object({ kind: z.literal("gave_full") })
const gavePartial = z.object({
  kind: z.literal("gave_partial"),
  amountAsked: money.positive(),
  amountGiven: money,
})
const declinedLower = z.object({
  kind: z.literal("declined"),
  adjust: z.literal("lower_meter"),
  newFill: z.number().finite().min(0).max(100_000),
})
const declinedRaise = z.object({
  kind: z.literal("declined"),
  adjust: z.literal("raise_capacity"),
  newCapacity: z.number().int().positive().max(100_000),
})

const askSchema = z.object({
  outcome: z.unknown(),
  amountAsked: money.nullish(),
  amountGiven: money.nullish(),
  note: z.string().max(2000).nullish(),
})

export type AskInput = {
  outcome: AskOutcome
  amountAsked: number | null
  amountGiven: number | null
  note: string | null
}

function parseOutcome(raw: unknown): AskOutcome | null {
  if (!raw || typeof raw !== "object") return null
  const { kind, adjust } = raw as { kind?: unknown; adjust?: unknown }
  const schema =
    kind === "gave_full"
      ? gaveFull
      : kind === "gave_partial"
        ? gavePartial
        : kind === "declined" && adjust === "lower_meter"
          ? declinedLower
          : kind === "declined" && adjust === "raise_capacity"
            ? declinedRaise
            : null
  if (!schema) return null
  const parsed = schema.safeParse(raw)
  return parsed.success ? (parsed.data as AskOutcome) : null
}

export function parseAskInput(raw: unknown): AskInput | null {
  const parsed = askSchema.safeParse(raw)
  if (!parsed.success) return null
  const outcome = parseOutcome(parsed.data.outcome)
  if (!outcome) return null
  return {
    outcome,
    amountAsked: parsed.data.amountAsked ?? null,
    amountGiven: parsed.data.amountGiven ?? null,
    note: parsed.data.note ?? null,
  }
}

const uuid = z.string().uuid()
export const parseDonorId = (raw: unknown): string | null => {
  const parsed = uuid.safeParse(raw)
  return parsed.success ? parsed.data : null
}
