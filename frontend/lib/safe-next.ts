/**
 * Sanitize a post-auth redirect target taken from `?next=` or a cookie.
 *
 * Only same-origin relative paths are allowed. Anything else — absolute URLs,
 * protocol-relative `//host`, backslash tricks (`/\host`, which browsers treat
 * as `//host`), `javascript:` — falls back to the dashboard, so a crafted link
 * can't send someone off-site after they sign in or sign up.
 */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback
  const value = raw.trim()
  if (!value.startsWith("/")) return fallback
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback
  // Control characters (tab/newline) are stripped by URL parsers and can turn
  // "/\t/evil.com" into "//evil.com".
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  return value
}
