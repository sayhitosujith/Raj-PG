/** Expense categories; the keys must match the backend's list in finance.ts. */
export const expenseCategoryLabels = { salaries: 'Staff salaries', utilities: 'Electricity & water', food: 'Food & groceries', maintenance: 'Maintenance & repairs', other: 'Other' } as const
export type ExpenseCategory = keyof typeof expenseCategoryLabels

/** A month's money in and out, from GET /api/finance/summary. All amounts are whole rupees. */
export type FinanceSummary = {
  month: string
  rentCollected: number
  rentExpected: number
  otherIncome: number
  income: number
  expenses: number
  expensesByCategory: Record<ExpenseCategory, number>
  profit: number
  totals: { income: number; expenses: number; profit: number }
}

export type Expense = { id: string; category: ExpenseCategory; amount: number; date: string; note: string; propertyId: string | null; property: string | null; createdAt: string }

async function getJson<T>(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} failed`)
  return await response.json() as T
}
export const fetchFinanceSummary = (month: string) => getJson<FinanceSummary>(`/api/finance/summary?month=${month}`)
export const fetchExpenses = (month: string) => getJson<Expense[]>(`/api/expenses?month=${month}`)
