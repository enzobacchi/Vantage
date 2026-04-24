/**
 * Per-request PII redaction for chat tool results and stream unredaction.
 *
 * Tool results are redacted (donor names → [DONOR_N]) before reaching the LLM.
 * User-typed messages are redacted via `redactUserText` before `streamText`.
 * The output stream is unredacted ([DONOR_N] → real name) before reaching the client.
 *
 * Amounts and dates are intentionally NOT redacted: the model needs them for
 * analytics, and they are not identifying once names/contact info are stripped.
 */

import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai"

import {
  type PIIMap,
  redactWithMap,
  redactWithMapWordBoundary,
  unredactWithMap,
} from "./pii-helpers"

/** Redact common PII patterns (emails, phone numbers) from free-text. */
export function redactPIIPatterns(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]")
    .replace(
      /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
      "[REDACTED_PHONE]"
    )
}

type DonorSeed = {
  display_name?: string | null
  email?: string | null
  phone?: string | null
}

/** Keys whose string values are treated as donor names. */
const NAME_KEYS = new Set(["display_name", "donor_name"])

/**
 * For the "name" key, only treat it as PII when the parent object
 * also has an "id" or "donor_id" sibling (avoids false positives
 * on campaign/fund names).
 */
const GUARDED_NAME_KEY = "name"
const GUARD_SIBLINGS = new Set(["id", "donor_id"])

export class ChatPIIRedactor {
  private map: PIIMap = { entries: {} }
  private nameCounter = 0
  private emailCounter = 0
  private phoneCounter = 0
  private seenNames = new Set<string>()
  private seenEmails = new Set<string>()
  private seenPhones = new Set<string>()

  /** Register a donor name and assign a [DONOR_N] placeholder. */
  addDonorName(value: string | null | undefined): void {
    if (!value?.trim()) return
    const v = value.trim()
    const key = v.toLowerCase()
    if (this.seenNames.has(key)) return
    this.seenNames.add(key)
    this.nameCounter++
    this.map.entries[`[DONOR_${this.nameCounter}]`] = v
  }

  /** Register a donor email and assign an [EMAIL_N] placeholder. */
  addEmail(value: string | null | undefined): void {
    if (!value?.trim()) return
    const v = value.trim()
    const key = v.toLowerCase()
    if (this.seenEmails.has(key)) return
    this.seenEmails.add(key)
    this.emailCounter++
    this.map.entries[`[EMAIL_${this.emailCounter}]`] = v
  }

  /** Register a donor phone number and assign a [PHONE_N] placeholder. */
  addPhone(value: string | null | undefined): void {
    if (!value?.trim()) return
    const v = value.trim()
    if (this.seenPhones.has(v)) return
    this.seenPhones.add(v)
    this.phoneCounter++
    this.map.entries[`[PHONE_${this.phoneCounter}]`] = v
  }

  /**
   * Bulk-seed the redactor from an array of donor-like rows. Typically called
   * once at the start of a chat request with the org's donor index so that
   * user messages and tool results share a consistent placeholder map.
   */
  seedFromDonors(donors: DonorSeed[]): void {
    for (const d of donors) {
      this.addDonorName(d.display_name)
      this.addEmail(d.email)
      this.addPhone(d.phone)
    }
  }

  /**
   * Redact a free-text user message before it reaches the LLM. Matches
   * seeded donor names/emails/phones first (so the round-trip unredaction
   * restores them on output) and then applies regex patterns to catch
   * any stray emails/phones not in the donor index.
   */
  redactUserText(text: string): string {
    if (!text) return text
    const withMap =
      Object.keys(this.map.entries).length === 0
        ? text
        : redactWithMapWordBoundary(text, this.map)
    return redactPIIPatterns(withMap)
  }

  /**
   * Redact PII from a tool result before it's sent back to the LLM.
   *
   * 1. Deep-walk the result to discover donor names in known fields.
   * 2. Serialize → redactWithMap → deserialize to catch names in
   *    embedded strings (e.g. `message: 'Created "Jane Smith".'`).
   */
  redactToolResult<T>(result: T): T {
    this.extractNames(result, null)

    if (Object.keys(this.map.entries).length === 0) return result

    const json = JSON.stringify(result)
    const redacted = redactWithMap(json, this.map)
    return JSON.parse(redacted) as T
  }

  /**
   * Return an `experimental_transform` compatible factory that unredacts
   * [DONOR_N] placeholders in streamed text-delta parts before the client
   * sees them.
   */
  createStreamTransform<T extends ToolSet>(): StreamTextTransform<T> {
    const redactor = this

    return () => {
      let buffer = ""
      let lastId = ""

      return new TransformStream<TextStreamPart<T>, TextStreamPart<T>>({
        transform(part, controller) {
          if (part.type === "text-delta") {
            lastId = part.id
            buffer += part.text

            const { safe, held } = splitAtPartialPlaceholder(buffer)
            buffer = held

            if (safe) {
              controller.enqueue({
                ...part,
                text: redactor.unredact(safe),
              })
            }
            return
          }

          // On text-end, flush any remaining buffer
          if (part.type === "text-end") {
            if (buffer) {
              controller.enqueue({
                type: "text-delta",
                id: lastId || part.id,
                text: redactor.unredact(buffer),
              } as TextStreamPart<T>)
              buffer = ""
            }
            controller.enqueue(part)
            return
          }

          controller.enqueue(part)
        },

        flush(controller) {
          if (buffer) {
            controller.enqueue({
              type: "text-delta",
              id: lastId,
              text: redactor.unredact(buffer),
            } as TextStreamPart<T>)
            buffer = ""
          }
        },
      })
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private unredact(text: string): string {
    return unredactWithMap(text, this.map)
  }

  /**
   * Recursively walk an object/array and call `addDonorName` for values
   * at PII-sensitive keys.
   */
  private extractNames(value: unknown, parentKeys: Set<string> | null): void {
    if (value == null || typeof value !== "object") return

    if (Array.isArray(value)) {
      for (const item of value) {
        this.extractNames(item, null)
      }
      return
    }

    const obj = value as Record<string, unknown>
    const keys = new Set(Object.keys(obj))

    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        if (NAME_KEYS.has(k)) {
          this.addDonorName(v)
        } else if (
          k === GUARDED_NAME_KEY &&
          [...GUARD_SIBLINGS].some((s) => keys.has(s))
        ) {
          this.addDonorName(v)
        }
      }

      // Recurse into nested objects/arrays
      if (typeof v === "object" && v !== null) {
        this.extractNames(v, keys)
      }
    }
  }
}

// ── Stream buffering helper ───────────────────────────────────────

/**
 * Split text into a "safe" prefix that can be emitted immediately
 * and a "held" suffix that might be the start of a placeholder
 * (e.g. `[DON` waiting for `OR_1]`).
 */
function splitAtPartialPlaceholder(text: string): {
  safe: string
  held: string
} {
  const lastOpen = text.lastIndexOf("[")
  if (lastOpen === -1) return { safe: text, held: "" }

  const tail = text.slice(lastOpen)

  // If there's a closing bracket after the last opening one, it's complete
  if (tail.includes("]")) return { safe: text, held: "" }

  // Unclosed bracket — hold it only if it's short enough to be a partial
  // placeholder (max is something like [ADDRESS_999] = 14 chars)
  if (tail.length > 15) return { safe: text, held: "" }

  return { safe: text.slice(0, lastOpen), held: tail }
}
