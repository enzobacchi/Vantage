/**
 * Keyset pagination cursor for the public API: base64url("created_at|id").
 * Stable under concurrent inserts, unlike offset pagination.
 *
 * The decoded parts are interpolated into a PostgREST .or() filter string, so
 * decodeCursor strictly validates them (ISO-8601 timestamp + UUID) — an
 * attacker controls the raw ?cursor= value, and unvalidated parts would allow
 * filter injection.
 */

const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)?$/
const CURSOR_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url")
}

export function decodeCursor(
  cursor: string
): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8")
    const sep = decoded.lastIndexOf("|")
    if (sep === -1) return null
    const createdAt = decoded.slice(0, sep)
    const id = decoded.slice(sep + 1)
    if (!CURSOR_TS_RE.test(createdAt) || !CURSOR_UUID_RE.test(id)) return null
    return { createdAt, id }
  } catch {
    return null
  }
}
