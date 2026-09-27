import { useState } from 'react'

/** Rows per page for the app's lists; card grids use a multiple of their column count instead. */
export const listPageSize = 10
/** The resident portal's lists sit in smaller cards, so they page sooner. */
export const portalListPageSize = 5

/**
 * Client-side paging for a list the page already holds in full. `resetKey` identifies the
 * current filter/search: when it changes the list starts again at page 1, without an effect,
 * because the stored page belongs to the key it was chosen under. The page is also clamped, so
 * deleting the last item on the last page never leaves an empty page.
 */
export function usePagination<T>(items: T[], pageSize = listPageSize, resetKey = '') {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(state.key === resetKey ? state.page : 1, pageCount)
  const start = (page - 1) * pageSize
  return {
    page,
    pageCount,
    pageItems: items.slice(start, start + pageSize),
    // 1-based positions of the first and last item shown, for "Showing 11–20 of 45".
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    total: items.length,
    setPage: (next: number) => setState({ key: resetKey, page: Math.min(Math.max(1, next), pageCount) }),
  }
}

export type PaginationState = ReturnType<typeof usePagination>
