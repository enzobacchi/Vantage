import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip SQL wildcards/artifacts for display (Criteria, Filter, etc.). Global replace % and _ so user never sees them. */
export function stripSqlArtifacts(text: string): string {
  if (typeof text !== "string") return ""
  return text
    .replace(/%/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
