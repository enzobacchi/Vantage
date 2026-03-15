/**
 * Format a monetary value as USD currency.
 * Returns "—" for null, undefined, or invalid numbers.
 */
export function formatCurrency(
  value: number | string | null | undefined
): string {
  if (value == null) return "—"
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" })
}
