/**
 * Multi-donor PII redaction for chat tool results.
 * Assigns numbered placeholders ([DONOR_1], [EMAIL_1], etc.) so Claude
 * never sees real names/emails, and the client can unredact the response.
 */

export type PIIMap = {
  /** placeholder -> real value, e.g. "[DONOR_1]" -> "Jane Smith" */
  entries: Record<string, string>
}

type DonorPIIFields = {
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  billing_address?: string | null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Build a PII map from an array of donor-like objects.
 * Each unique PII value gets a numbered placeholder.
 */
export function buildPIIMapFromDonors(donors: DonorPIIFields[]): PIIMap {
  const entries: Record<string, string> = {}
  let nameIdx = 0
  let emailIdx = 0
  let phoneIdx = 0
  let addressIdx = 0

  const seen = new Set<string>()

  for (const d of donors) {
    if (d.display_name?.trim() && !seen.has(d.display_name.trim())) {
      nameIdx++
      const val = d.display_name.trim()
      seen.add(val)
      entries[`[DONOR_${nameIdx}]`] = val
    }
    if (d.email?.trim() && !seen.has(d.email.trim())) {
      emailIdx++
      const val = d.email.trim()
      seen.add(val)
      entries[`[EMAIL_${emailIdx}]`] = val
    }
    if (d.phone?.trim() && !seen.has(d.phone.trim())) {
      phoneIdx++
      const val = d.phone.trim()
      seen.add(val)
      entries[`[PHONE_${phoneIdx}]`] = val
    }
    if (d.billing_address?.trim() && !seen.has(d.billing_address.trim())) {
      addressIdx++
      const val = d.billing_address.trim()
      seen.add(val)
      entries[`[ADDRESS_${addressIdx}]`] = val
    }
  }

  return { entries }
}

/**
 * Replace all real PII values in text with their placeholders.
 * Longer values are replaced first to avoid partial matches.
 */
export function redactWithMap(text: string, map: PIIMap): string {
  let result = text
  // Sort by value length descending to replace longer strings first
  const sorted = Object.entries(map.entries).sort(
    ([, a], [, b]) => b.length - a.length
  )
  for (const [placeholder, realValue] of sorted) {
    result = result.replace(
      new RegExp(escapeRegex(realValue), "gi"),
      placeholder
    )
  }
  return result
}

/**
 * Restore real PII values from placeholders in text.
 */
export function unredactWithMap(text: string, map: PIIMap): string {
  let result = text
  for (const [placeholder, realValue] of Object.entries(map.entries)) {
    result = result.split(placeholder).join(realValue)
  }
  return result
}

/**
 * Word-boundary variant of `redactWithMap`. Use for free-text (user messages,
 * transcribed audio) where substring matching would clobber unrelated tokens —
 * e.g. redacting "Ven" inside "Venmo".
 *
 * Uses negative lookaround (`(?<!\w)` / `(?!\w)`) instead of `\b` so that
 * values starting or ending with punctuation (phone numbers like
 * "(555) 123-4567") still match correctly.
 *
 * Values shorter than 3 characters are skipped to avoid false positives
 * on common initials or nicknames ("Jo", "Al").
 */
export function redactWithMapWordBoundary(text: string, map: PIIMap): string {
  let result = text
  const sorted = Object.entries(map.entries).sort(
    ([, a], [, b]) => b.length - a.length
  )
  for (const [placeholder, realValue] of sorted) {
    if (realValue.length < 3) continue
    const pattern = `(?<!\\w)${escapeRegex(realValue)}(?!\\w)`
    result = result.replace(new RegExp(pattern, "gi"), placeholder)
  }
  return result
}
