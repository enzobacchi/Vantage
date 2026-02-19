/**
 * PII Redaction for OpenAI requests.
 * Strip names, emails, and addresses from prompts before sending to OpenAI.
 * Replace with placeholders like [DONOR_NAME]; re-insert real data after the response.
 *
 * Goal: OpenAI should never see actual donor identity.
 */

export const PLACEHOLDERS = {
  DONOR_NAME: "[DONOR_NAME]",
  DONOR_EMAIL: "[DONOR_EMAIL]",
  DONOR_ADDRESS: "[DONOR_ADDRESS]",
  DONOR_CITY: "[DONOR_CITY]",
  DONOR_STATE: "[DONOR_STATE]",
} as const

export type PIIValues = {
  name?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
}

export type RedactionResult = {
  redacted: string
  placeholders: Record<string, string>
}

function escapeForReplacement(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Redact PII from text before sending to OpenAI.
 * Replaces names, emails, addresses with placeholders.
 * Returns redacted text and a map of placeholder -> real value for unredaction.
 */
export function redactPII(text: string, pii: PIIValues): RedactionResult {
  let redacted = text
  const placeholders: Record<string, string> = {}

  if (pii.name != null && String(pii.name).trim() !== "") {
    const v = String(pii.name).trim()
    placeholders["DONOR_NAME"] = v
    redacted = redacted.replace(new RegExp(escapeForReplacement(v), "gi"), PLACEHOLDERS.DONOR_NAME)
  }

  if (pii.email != null && String(pii.email).trim() !== "") {
    const v = String(pii.email).trim()
    placeholders["DONOR_EMAIL"] = v
    redacted = redacted.replace(new RegExp(escapeForReplacement(v), "gi"), PLACEHOLDERS.DONOR_EMAIL)
  }

  if (pii.address != null && String(pii.address).trim() !== "") {
    const v = String(pii.address).trim()
    placeholders["DONOR_ADDRESS"] = v
    redacted = redacted.replace(new RegExp(escapeForReplacement(v), "gi"), PLACEHOLDERS.DONOR_ADDRESS)
  }

  if (pii.city != null && String(pii.city).trim() !== "") {
    const v = String(pii.city).trim()
    placeholders["DONOR_CITY"] = v
    redacted = redacted.replace(new RegExp(escapeForReplacement(v), "gi"), PLACEHOLDERS.DONOR_CITY)
  }

  if (pii.state != null && String(pii.state).trim() !== "") {
    const v = String(pii.state).trim()
    placeholders["DONOR_STATE"] = v
    redacted = redacted.replace(new RegExp(escapeForReplacement(v), "gi"), PLACEHOLDERS.DONOR_STATE)
  }

  return { redacted, placeholders }
}

/**
 * Re-insert real PII into OpenAI response text.
 * Replaces placeholders like [DONOR_NAME] with the actual values.
 */
export function unredactPII(text: string, placeholders: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(placeholders)) {
    const placeholder = `[${key}]`
    result = result.split(placeholder).join(value)
  }
  return result
}
