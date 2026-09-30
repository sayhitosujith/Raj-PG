import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { expenseCategoryLabels, fetchExpenses, fetchFinanceSummary, type Expense, type ExpenseCategory, type FinanceSummary } from './finance'
import { IncomeDonut } from './IncomeDonut'
import { todayDateInputValue } from './joinDate'
import { Pagination } from './Pagination'
import { formatMonth, formatRupees } from './rent'
import { readApiError } from './superAdmin'
import { useRefreshSignal } from './useAutoRefresh'
import { usePagination } from './usePagination'

type PropertyOption = { id: string; name: string }

const thisMonth = () => todayDateInputValue().slice(0, 7)

/**
 * Monthly money summary under the Payments list: rent collected against rent expected, other
 * income, expenses, profit or loss, and income since the start. The owner records expenses here.
 * `version` changes whenever a payment changes, so the figures follow the list above.
 */
export function FinanceOverview({ properties, version, refreshSignal, onNotice }: { properties: PropertyOption[]; version: number; refreshSignal: number; onNotice: (message: string) => void }) {
  const [month, setMonth] = useState(thisMonth)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const pager = usePagination(expenses, 8, month)

  const load = useCallback(() => {
    Promise.all([fetchFinanceSummary(month), fetchExpenses(month)]).then(([nextSummary, nextExpenses]) => { setSummary(nextSummary); setExpenses(nextExpenses) }, () => onNotice('The finance summary could not be loaded.'))
  }, [month, onNotice])
  useEffect(load, [load, version])
  useRefreshSignal(refreshSignal, load)

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: form.get('category'), amount: Number(form.get('amount')), date: form.get('date'), note: form.get('note'), propertyId: form.get('propertyId') }) }).catch(() => null)
    if (!response?.ok) { onNotice(response ? await readApiError(response, 'The expense could not be saved.') : 'Could not reach the server.'); return }
    const saved = await response.json() as Expense
    setIsAdding(false)
    onNotice(`${formatRupees(saved.amount)} expense added.`)
    // The expense may belong to another month; jump there so it is visible.
    const savedMonth = saved.date.slice(0, 7)
    if (savedMonth !== month) setMonth(savedMonth); else load()
  }

  async function removeExpense(expense: Expense) {
    if (!window.confirm(`Delete the ${formatRupees(expense.amount)} ${expenseCategoryLabels[expense.category].toLowerCase()} expense?`)) return
    const response = await fetch(`/api/expenses/${expense.id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) { onNotice('The expense could not be deleted.'); return }
    onNotice('Expense deleted.')
    load()
  }

  const isLoss = (summary?.profit ?? 0) < 0
  const totalsLoss = (summary?.totals.profit ?? 0) < 0

  return (
    <section className="finance-overview">
      <div className="finance-head">
        <div><p className="eyebrow">Money</p><h3>Income and expenses</h3><p>Rent collected, other income and what you spent, for the month you pick.</p></div>
        <label className="finance-month">Month<input type="month" value={month} max={thisMonth()} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
      </div>
      {!summary ? <p className="portal-empty">Loading…</p> : <>
        <div className="finance-kpis">
          <div className="finance-kpi"><span>Rent collected · {formatMonth(month)}</span><strong>{formatRupees(summary.rentCollected)}</strong><small>of {formatRupees(summary.rentExpected)} expected{summary.rentExpected > summary.rentCollected ? ` · ${formatRupees(summary.rentExpected - summary.rentCollected)} still due` : ''}</small></div>
          <div className="finance-kpi"><span>Other income</span><strong>{formatRupees(summary.otherIncome)}</strong><small>Payments not linked to rent</small></div>
          <div className="finance-kpi is-expense"><span>Expenses</span><strong>{formatRupees(summary.expenses)}</strong><small>{expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}</small></div>
          <div className={`finance-kpi ${isLoss ? 'is-loss' : 'is-profit'}`}><span>{isLoss ? 'Loss' : 'Profit'} · {formatMonth(month)}</span><strong>{isLoss ? <TrendingDown size={18} aria-hidden="true" /> : <TrendingUp size={18} aria-hidden="true" />}{isLoss ? '−' : ''}{formatRupees(Math.abs(summary.profit))}</strong><small>income − expenses</small></div>
          <div className="finance-kpi is-hero"><span>Total income till now</span><strong>{formatRupees(summary.totals.income)}</strong><small>{totalsLoss ? 'Loss' : 'Profit'} so far {totalsLoss ? '−' : ''}{formatRupees(Math.abs(summary.totals.profit))} after {formatRupees(summary.totals.expenses)} expenses</small></div>
        </div>
        <IncomeDonut summary={summary} />
      </>}

      <div className="finance-expenses">
        <div className="finance-expenses-head"><strong>Expenses · {formatMonth(month)}</strong><button type="button" className="secondary-button" onClick={() => setIsAdding((open) => !open)}><Plus size={14} /> {isAdding ? 'Close' : 'Add expense'}</button></div>
        {isAdding && (
          <form className="finance-expense-form" onSubmit={addExpense}>
            <label>Category<select name="category" defaultValue="salaries">{(Object.keys(expenseCategoryLabels) as ExpenseCategory[]).map((key) => <option key={key} value={key}>{expenseCategoryLabels[key]}</option>)}</select></label>
            <label>Amount (₹)<input name="amount" type="number" min={1} step={1} required /></label>
            <label>Date<input name="date" type="date" required defaultValue={month === thisMonth() ? todayDateInputValue() : `${month}-01`} max={todayDateInputValue()} /></label>
            <label>Property<select name="propertyId" defaultValue=""><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
            <label className="finance-note">Note <span>(optional)</span><input name="note" maxLength={200} placeholder="e.g. September electricity bill" /></label>
            <button type="submit" className="primary-button"><Plus size={15} /> Save expense</button>
          </form>
        )}
        {expenses.length ? <div className="crud-list">{pager.pageItems.map((expense) => (
          <div className="crud-row" key={expense.id}>
            <div className="crud-main"><strong>{expenseCategoryLabels[expense.category] ?? expense.category} · <span className="expense-amount">{formatRupees(expense.amount)}</span></strong><small>{[new Date(expense.date).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }), expense.property ?? 'All properties', expense.note].filter(Boolean).join(' · ')}</small></div>
            <div className="crud-actions"><button className="row-delete" aria-label={`Delete ${formatRupees(expense.amount)} expense`} onClick={() => removeExpense(expense)}><Trash2 size={14} /></button></div>
          </div>
        ))}</div> : <p className="portal-empty">No expenses recorded for {formatMonth(month)}.</p>}
        <Pagination state={pager} label="Expenses" />
      </div>
    </section>
  )
}
