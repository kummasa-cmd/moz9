type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// PostgREST caps every select at the project's max-rows (Supabase default:
// 1000) and silently truncates the rest, so any "fetch every row" query must
// page through with .range(). `page` must apply a stable .order() so pages
// don't overlap or skip.
//
// Keeps requesting until an empty page rather than stopping on a short one,
// so it stays correct even if max-rows is configured below pageSize.
//
// Throws instead of returning a partial list: callers use this for recipient
// and do-not-contact lists, where a silently short list means missed
// subscribers or, worse, mailing someone who has unsubscribed.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}
