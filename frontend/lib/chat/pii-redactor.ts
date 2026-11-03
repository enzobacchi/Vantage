/**
 * Per-request PII redaction for chat tool results and stream unredaction.
 *
 * Tool results are redacted before reaching the LLM: donor names → [DONOR_N],
 * street addresses → [ADDRESS_N], custom-field values → [CUSTOM_N], and
 * campaign/fund/category names → [CAMPAIGN_N]/[FUND_N]/[CATEGORY_N].
 * `wrapTools` applies this only to what the model sees (`toModelOutput`); the
 * client still receives the raw tool output to render cards and charts.
 * User-typed messages are redacted via `redactUserText` before `streamText`.
 * The output stream is unredacted ([DONOR_N] → real name) before reaching the client.
 *
 * Amounts and dates are intentionally NOT redacted: the model needs them for
 * analytics, and they are not identifying once names/contact info are stripped.
 */

import type {
  JSONValue,
  StreamTextTransform,
  TextStreamPart,
  Tool,
  ToolExecutionOptions,
  ToolSet,
} from "ai"

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

/**
 * Keys whose string values are street-level address data. City and state stay
 * visible: geography questions need them (see "Accepted risks" in
 * docs/AUDIT-2026-07.md).
 */
const ADDRESS_KEYS = new Set([
  "billing_address",
  "address",
  "address_line1",
  "address_line2",
  "street",
  "zip",
  "postal_code",
])

/**
 * Keys holding free text that may contain stray emails or phone numbers,
 * including tool error text (Postgres errors echo the offending value).
 */
const FREE_TEXT_KEYS = new Set([
  "subject",
  "memo",
  "notes",
  "note",
  "content",
  "body",
  "description",
  "error",
  "message",
  "reason",
  "warning",
])

/**
 * Keys whose values are campaign/fund/category names. `groups` is the
 * timeseries group list; objects in `series` use group names as keys.
 * Matching only here keeps a category named "Active" from rewriting
 * `lifecycle_status: "Active"`.
 */
const OPTION_KEYS = new Set(["campaign_name", "fund_name", "category_name", "group", "groups"])
const OPTION_KEYED_ROWS_KEY = "series"

/** Every string leaf under this key is a custom-field value. */
const CUSTOM_FIELDS_KEY = "custom_fields"

export type DonationOptionType = "campaign" | "fund" | "category"

export class ChatPIIRedactor {
  private map: PIIMap = { entries: {} }
  private nameCounter = 0
  private emailCounter = 0
  private phoneCounter = 0
  private seenNames = new Set<string>()
  private seenEmails = new Set<string>()
  private seenPhones = new Set<string>()

  /**
   * Placeholders that are only ever substituted at a known field position,
   * never by substring search over the serialized result: a zip like "5000"
   * or a category named "Other" would otherwise clobber amounts and enums.
   */
  private fieldMap: PIIMap = { entries: {} }
  private fieldCounters: Record<string, number> = {}
  private fieldPlaceholders = new Map<string, string>()
  /** Exact campaign/fund/category name → placeholder. */
  private optionNames = new Map<string, string>()

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
   * Register a campaign, fund, or category name. Fund names often carry a
   * person's name ("Ruth Henderson Memorial Scholarship"), so an option field
   * (see OPTION_KEYS) equal to it becomes [FUND_N] etc. Matching is exact and
   * case-sensitive.
   */
  addOptionName(type: DonationOptionType, name: string | null | undefined): void {
    if (!name?.trim() || this.optionNames.has(name)) return
    this.optionNames.set(name, this.fieldPlaceholder(type.toUpperCase(), name))
  }

  /**
   * Seed every org option before any history is converted: replayed tool
   * outputs from earlier turns reach the model before any tool runs this
   * request. Pass a stable order (e.g. created_at, id) so the same option
   * gets the same placeholder on every request.
   */
  seedOptions(options: { type: string; name: string | null }[]): void {
    for (const o of options) {
      if (o.type === "campaign" || o.type === "fund" || o.type === "category") {
        this.addOptionName(o.type, o.name)
      }
    }
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
    const fieldsRedacted = this.redactFields(result, null) as T

    if (Object.keys(this.map.entries).length === 0) return fieldsRedacted

    const json = JSON.stringify(fieldsRedacted)
    const redacted = redactWithMap(json, this.map)
    return JSON.parse(redacted) as T
  }

  /**
   * Restore real values in a tool call's arguments before it executes.
   * The model only ever sees placeholders, so it passes them back as
   * arguments (e.g. `fund_name: "[FUND_2]"`); the server-side query needs the
   * real value to match. Safe because the result is re-redacted before the
   * model sees it.
   */
  unredactToolInput<T>(input: T): T {
    if (
      Object.keys(this.map.entries).length === 0 &&
      Object.keys(this.fieldMap.entries).length === 0
    ) {
      return input
    }
    const walk = (value: unknown): unknown => {
      if (typeof value === "string") return this.unredact(value)
      if (Array.isArray(value)) return value.map(walk)
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
      }
      return value
    }
    return walk(input) as T
  }

  /**
   * Put this redactor on the model boundary of every tool: inputs are
   * unredacted before `execute`, and only the model's copy of the output is
   * redacted (`toModelOutput`). The raw output still streams to the client,
   * which is the signed-in org user viewing their own data. Pass the same
   * tools to `convertToModelMessages` so replayed history is redacted too.
   */
  wrapTools<T extends ToolSet>(tools: T): T {
    const wrapped: ToolSet = {}
    for (const [name, t] of Object.entries(tools)) {
      const execute = t.execute
      const wrappedTool: Tool = {
        ...t,
        toModelOutput: ({ output }) => ({
          type: "json",
          value: (this.redactToolResult(output) ?? null) as JSONValue,
        }),
      }
      if (execute) {
        // A thrown error's message reaches the model as raw text (it skips
        // toModelOutput), so redact it on the way out.
        wrappedTool.execute = async (input: unknown, options: ToolExecutionOptions) => {
          try {
            return await execute(this.unredactToolInput(input), options)
          } catch (e) {
            throw new Error(this.redactUserText(e instanceof Error ? e.message : String(e)))
          }
        }
      }
      wrapped[name] = wrappedTool
    }
    return wrapped as T
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
    return unredactWithMap(unredactWithMap(text, this.map), this.fieldMap)
  }

  private fieldPlaceholder(kind: string, value: string): string {
    const key = `${kind}:${value}`
    const existing = this.fieldPlaceholders.get(key)
    if (existing) return existing
    const n = (this.fieldCounters[kind] ?? 0) + 1
    this.fieldCounters[kind] = n
    const placeholder = `[${kind}_${n}]`
    this.fieldPlaceholders.set(key, placeholder)
    this.fieldMap.entries[placeholder] = value
    return placeholder
  }

  /**
   * Return a copy of `value` with field-position PII replaced. Arrays inherit
   * their parent key, so `groups: ["Building Fund"]` and `notes: [...]` are
   * handled like scalars. Never mutates the input.
   */
  private redactFields(value: unknown, key: string | null): unknown {
    if (typeof value === "string") return this.redactFieldString(value, key)
    if (Array.isArray(value)) return value.map((v) => this.redactFields(v, key))
    if (value && typeof value === "object") {
      if (key === CUSTOM_FIELDS_KEY) return this.redactCustomFields(value)
      const renameKeys = key === OPTION_KEYED_ROWS_KEY
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          (renameKeys && this.optionNames.get(k)) || k,
          this.redactFields(v, k),
        ])
      )
    }
    return value
  }

  private redactFieldString(value: string, key: string | null): string {
    if (key === null || !value.trim()) return value
    const option = OPTION_KEYS.has(key) ? this.optionNames.get(value) : undefined
    if (option) return option
    if (ADDRESS_KEYS.has(key)) return this.fieldPlaceholder("ADDRESS", value)
    if (key === "email") this.addEmail(value)
    if (key === "phone") this.addPhone(value)
    if (FREE_TEXT_KEYS.has(key)) return redactPIIPatterns(value)
    return value
  }

  private redactCustomFields(value: unknown): unknown {
    if (typeof value === "string") {
      return value.trim() ? this.fieldPlaceholder("CUSTOM", value) : value
    }
    if (Array.isArray(value)) return value.map((v) => this.redactCustomFields(v))
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.redactCustomFields(v)])
      )
    }
    return value
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
