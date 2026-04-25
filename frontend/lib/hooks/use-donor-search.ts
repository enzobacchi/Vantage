"use client"

import * as React from "react"

export type DonorSearchItem = {
  id: string
  display_name: string | null
  total_lifetime_value: number | string | null
}

type Options = {
  debounceMs?: number
}

/**
 * Debounced donor search against /api/donors/search. Returns query state,
 * results, and a loading flag. Results clear when the trimmed query is empty.
 */
export function useDonorSearch(options: Options = {}) {
  const debounceMs = options.debounceMs ?? 200

  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<DonorSearchItem[]>([])
  const [searching, setSearching] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/donors/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((arr: DonorSearchItem[]) =>
          setResults(Array.isArray(arr) ? arr : [])
        )
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, debounceMs)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, debounceMs])

  const clear = React.useCallback(() => {
    setQuery("")
    setResults([])
  }, [])

  return { query, setQuery, results, searching, clear }
}
