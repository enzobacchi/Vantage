const PAGE_SIZE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Read every row of a query, paging with .range(). PostgREST caps a single
 * select at 1000 rows, so an unpaged sum silently undercounts large orgs.
 * The query passed in must have a stable .order() so pages don't overlap.
 * Throws on error rather than returning a partial result.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageResult<T>
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
  }
}
