import { useState } from 'react'
import { FileUp, LogIn, X } from 'lucide-react'
import { PerformanceVerdict, TimingTable } from './PerformanceResults'
import { formatMs, timedFetch, timingRows, verdict, type Sample } from './perfStats'

type Credential = { identifier: string; password: string }
type Outcome = 'Passed' | 'Checks failed' | 'Wrong password' | 'Blocked' | 'No answer'
type AccountResult = { identifier: string; outcome: Outcome; note: string; passed: number; total: number; ms: number }

/** Accounts signed in at the same time; more than this in a file wait their turn. */
const MAX_AT_ONCE = 20

/** What each signed-in resident loads, as the portal's Home and Services tabs do. Food only for residents on the plan. */
const portalChecks = [
  { label: 'Session', path: '/api/auth/session' },
  { label: 'Housekeeping', path: '/api/resident-portal/housekeeping' },
  { label: 'Photos', path: '/api/resident-portal/photos' },
  { label: 'Announcements', path: '/api/resident-portal/announcements' },
  { label: 'Holidays', path: '/api/resident-portal/holidays' },
] as const
const timingLabels = ['Sign in', 'Profile', 'Food', ...portalChecks.map((check) => check.label), 'Sign out']

/** Rows of [email or phone, password] from either file type; an optional header row is skipped. */
function credentialsFromRows(rows: string[][]): Credential[] {
  return rows.flatMap(([rawIdentifier = '', rawPassword = ''], index) => {
    const identifier = rawIdentifier.trim()
    const password = rawPassword.trim()
    if (index === 0 && /^(identifier|email|phone|username|user)$/i.test(identifier)) return []
    return identifier && password && !identifier.startsWith('#') ? [{ identifier, password }] : []
  })
}

/**
 * "identifier,password" per line, with an optional header row. Split at the first comma only, so a
 * password may itself contain commas.
 */
function parseCredentials(text: string): Credential[] {
  const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, '$1')
  return credentialsFromRows(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const comma = line.indexOf(',')
    return comma < 0 ? [line] : [unquote(line.slice(0, comma)), unquote(line.slice(comma + 1))]
  }))
}

/**
 * Accounts from a .csv/.txt file or the first sheet of an .xlsx workbook (column A email or phone,
 * column B password). Any other binary file is refused: read as text, a workbook's zipped bytes
 * became rows of garbage "accounts". The spreadsheet reader is only downloaded when it is needed.
 */
async function readCredentialsFile(file: File): Promise<Credential[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    // Phone numbers and numeric passwords come back as numbers; turn every cell back into text.
    return credentialsFromRows((await readSheet(file)).map((row) => row.map((cell) => cell == null ? '' : String(cell))))
  }
  const text = await file.text()
  if (text.startsWith('PK') || text.includes('\u0000')) throw new Error('This file type cannot be read. Use a .csv or .xlsx file (older .xls files: save as .xlsx first).')
  return parseCredentials(text)
}

/** Counts only the server not answering, or answering with an error of its own, as a timing failure. */
const answered = (status: number) => status > 0 && status < 500

/**
 * Signs one resident in on its own session, loads the portal, and signs out again. Uses the resident
 * sign-in the mobile app uses, which returns a bearer token; with `credentials: 'omit'` no cookie is
 * stored, so the super admin running the test stays signed in as themselves.
 */
async function testAccount({ identifier, password }: Credential, samples: Sample[]): Promise<AccountResult> {
  const started = performance.now()
  const result = (outcome: Outcome, note: string, passed = 0, total = 0): AccountResult => ({ identifier, outcome, note, passed, total, ms: performance.now() - started })
  const signIn = await timedFetch('/api/resident-portal/login', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) })
  samples.push({ label: 'Sign in', ms: signIn.ms, ok: answered(signIn.status) })
  const body = (() => { try { return JSON.parse(signIn.text) as { token?: string; mustSetPassword?: boolean; error?: string } } catch { return {} } })()
  if (signIn.status === 401) return result('Wrong password', body.error ?? 'Invalid email, phone, or password.')
  if (signIn.status === 403) return result('Blocked', body.error ?? 'Sign-in is blocked for this account.')
  if (!signIn.ok) return result('No answer', body.error ?? `Sign-in answered ${signIn.status || 'nothing'}.`)
  if (!body.token) return result('No answer', 'The server did not return a session token.')

  const auth = { credentials: 'omit' as const, headers: { Authorization: `Bearer ${body.token}` } }
  let passed = 0
  let total = 0
  const failures: string[] = []
  const check = async (label: string, path: string) => {
    const response = await timedFetch(path, auth)
    samples.push({ label, ms: response.ms, ok: answered(response.status) })
    total += 1
    if (response.ok) passed += 1
    else failures.push(`${label} ${response.status || 'no answer'}`)
    return response
  }

  const profile = await check('Profile', '/api/resident-portal/me')
  const foodOpted = (() => { try { return Boolean((JSON.parse(profile.text) as { foodOpted?: boolean }).foodOpted) } catch { return false } })()
  await Promise.all([...portalChecks.map(({ label, path }) => check(label, path)), ...(foodOpted ? [check('Food', '/api/resident-portal/food')] : [])])
  const signOut = await timedFetch('/api/auth/logout', { ...auth, method: 'POST' })
  samples.push({ label: 'Sign out', ms: signOut.ms, ok: answered(signOut.status) })

  // Still a pass: the account works, it will just be asked for a new password in the portal.
  const note = body.mustSetPassword ? 'Will be asked to set a new password.' : ''
  return failures.length ? result('Checks failed', failures.join(', '), passed, total) : result('Passed', note, passed, total)
}

/** Runs every account, at most MAX_AT_ONCE signed in together. */
async function runPool(accounts: Credential[], samples: Sample[], onDone: () => void) {
  const results: AccountResult[] = new Array(accounts.length)
  let next = 0
  const worker = async () => {
    while (next < accounts.length) {
      const index = next
      next += 1
      results[index] = await testAccount(accounts[index], samples)
      onDone()
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_AT_ONCE, accounts.length) }, worker))
  return results
}

/**
 * The sign-in test on the Performance tests page: load a credentials file, then each account signs
 * in, loads its portal and signs out, all at once. The file is read in this browser and kept in
 * memory only; it is never uploaded or saved, and passwords are never shown.
 */
export function LoginTestPanel() {
  const [accounts, setAccounts] = useState<Credential[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [run, setRun] = useState<{ results: AccountResult[]; samples: Sample[]; totalMs: number } | null>(null)

  async function load(file: File | undefined) {
    setRun(null)
    if (!file) return
    setFileName(file.name)
    let parsed: Credential[] = []
    try {
      parsed = await readCredentialsFile(file)
    } catch (error) {
      setAccounts(null)
      setFileError(error instanceof Error && error.message.startsWith('This file type') ? error.message : 'This file could not be read. Check it opens, then save it again as .csv or .xlsx.')
      return
    }
    setAccounts(parsed.length ? parsed : null)
    setFileError(parsed.length ? '' : 'No accounts found. Put the email or phone in the first column and the password in the second.')
  }

  function clear() {
    setAccounts(null)
    setFileName('')
    setFileError('')
    setRun(null)
  }

  async function start() {
    if (!accounts) return
    const samples: Sample[] = []
    let done = 0
    setRun(null)
    setProgress({ done, total: accounts.length })
    const started = performance.now()
    const results = await runPool(accounts, samples, () => { done += 1; setProgress({ done, total: accounts.length }) })
    setRun({ results, samples, totalMs: performance.now() - started })
    setProgress(null)
  }

  const summary = run && verdict(run.samples)
  const working = run ? run.results.filter((result) => result.outcome === 'Passed').length : 0

  return (
    <div className="login-test">
      <h3 className="performance-tests-subheading">Resident sign-in</h3>
      <div className="performance-tests-controls">
        <label className="secondary-button login-test-file"><FileUp size={14} /> {fileName || 'Choose credentials file'}<input type="file" accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={progress !== null} onChange={(event) => { void load(event.target.files?.[0]); event.target.value = '' }} /></label>
        {accounts && <span className="login-test-count">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} loaded</span>}
        {fileName && progress === null && <button type="button" className="text-link" onClick={clear}><X size={12} /> Clear</button>}
        <button type="button" className="primary-button" disabled={!accounts || progress !== null} onClick={() => void start()}><LogIn size={14} /> {progress ? `Testing… ${progress.done} of ${progress.total}` : 'Sign in and check'}</button>
        <p className="settings-hint">Resident accounts only: a .csv with email or phone, a comma, then the password on each line, or an .xlsx with the email or phone in column A and the password in column B (first sheet; a header row is fine). The file stays in this browser and is forgotten when you leave the page. Each account signs in on its own session, loads its portal and signs out, up to {MAX_AT_ONCE} at once; you stay signed in as yourself.</p>
        {fileError && <p className="login-error" role="alert">{fileError}</p>}
      </div>
      {run && summary && <>
        <PerformanceVerdict passed={summary.passed && working === run.results.length}>{working} of {run.results.length} accounts working · {run.samples.length} requests in {formatMs(run.totalMs)} · slowest 5% {formatMs(summary.p95)} · {summary.failed} server errors</PerformanceVerdict>
        <table className="finance-table performance-tests-table login-test-accounts">
          <thead><tr><th>Account</th><th>Result</th><th>Checks</th><th>Time</th></tr></thead>
          <tbody>{run.results.map((result, index) => <tr key={`${result.identifier}-${index}`} className={result.outcome === 'Passed' ? undefined : 'is-slow'}><td><strong>{result.identifier}</strong></td><td>{result.outcome}{result.note && <small>{result.note}</small>}</td><td>{result.total ? `${result.passed} of ${result.total}` : '—'}</td><td>{formatMs(result.ms)}</td></tr>)}</tbody>
        </table>
        <TimingTable rows={timingRows(run.samples, timingLabels)} />
      </>}
    </div>
  )
}
