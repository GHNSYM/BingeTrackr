import "server-only";

/**
 * PostgREST caps how many rows a single response may contain (`db-max-rows`,
 * 1000 on this project). It does NOT error when it truncates — you just get
 * 1000 rows back and no indication there were more.
 *
 * That silently corrupted every JS-side aggregate: a user with 1490
 * watched_entries got stats computed from an arbitrary 1000 of them, so
 * per-show episode counts and total hours were both simply wrong.
 *
 * Any query that can legitimately return more than a few hundred rows must go
 * through fetchAllRows. Note that `count: "exact", head: true` is NOT affected
 * — PostgREST computes those server-side — so plain counts are safe as-is.
 */
export const SUPABASE_MAX_ROWS = 1000;

type Page<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Page through a query until it's exhausted.
 *
 * `page` must apply `.range(from, to)` AND a stable `.order(...)` on a unique
 * column — without a total ordering, Postgres is free to return rows in a
 * different order per request, which would duplicate and skip rows across
 * page boundaries.
 *
 * Throws on error rather than returning what it managed to collect. Partial
 * aggregates presented as complete are exactly the bug this exists to fix; a
 * visible failure is better than a confident wrong number.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize: number = SUPABASE_MAX_ROWS,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) {
      throw new Error(`fetchAllRows failed at offset ${from}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    // A short page means we've reached the end.
    if (data.length < pageSize) break;
  }

  return rows;
}
