import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationState } from './usePagination'

/** Page numbers to show: the first, the last, and the current page with one neighbour each side. */
function visiblePages(page: number, pageCount: number): Array<number | 'gap'> {
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  return pages.flatMap((value, index) => (index > 0 && value - pages[index - 1] > 1 ? ['gap' as const, value] : [value]))
}

/**
 * Pager for a list paged with usePagination: "Showing 11–20 of 45", previous/next and page
 * numbers. Renders nothing when everything fits on one page, so short lists look unchanged.
 */
export function Pagination({ state, label }: { state: PaginationState; label: string }) {
  const { page, pageCount, from, to, total, setPage } = state
  if (pageCount <= 1) return null
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <span className="pagination-summary">Showing {from}–{to} of {total}</span>
      <div className="pagination-controls">
        <button type="button" className="pagination-button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
        {visiblePages(page, pageCount).map((value, index) => value === 'gap'
          ? <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">…</span>
          : <button key={value} type="button" className={`pagination-button${value === page ? ' is-current' : ''}`} aria-label={`Page ${value}`} aria-current={value === page ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>)}
        <button type="button" className="pagination-button" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
      </div>
    </nav>
  )
}
