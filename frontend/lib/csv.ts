export type CsvCell = string | number | null | undefined

function escapeCell(val: CsvCell): string {
  if (val == null) return ""
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ]
  return lines.join("\n")
}
