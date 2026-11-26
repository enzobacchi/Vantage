const PAGE_SIZE = 1000

/**
 * Ids per `.in()` filter. Each UUID adds ~37 characters to the request URL;
 * 200 keeps it well under proxy limits. A longer list makes the request fail
 * or come back empty.
 */
export const IN_CHUNK_SIZE = 200

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

/**
 * Read every row matching a long id list: splits the ids into `.in()`-sized
 * chunks and pages within each chunk. The query must apply `.in(col, ids)`
 * with the chunk it is given, a stable `.order()`, and `.range(from, to)`.
 * Throws on error rather than returning a partial result.
 */
export async function fetchAllByIds<T>(
  ids: readonly string[],
  fetchPage: (ids: string[], from: number, to: number) => PageResult<T>,
  chunkSize: number = IN_CHUNK_SIZE
): Promise<T[]> {
  const unique = [...new Set(ids)]
  const all: T[] = []
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    all.push(...(await fetchAllRows<T>((from, to) => fetchPage(chunk, from, to))))
  }
  return all
}
