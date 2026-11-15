import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'
import { readApiError } from './superAdmin'

/**
 * Super admins' Reset on the Overview: the three rent cards (today, this month, overall) count again from now,
 * like a trip meter. Only the start time is stored; every payment stays recorded, so a confirmation pop-up
 * asks first and says so. `onReset` reloads the Overview so the cards show the new figures.
 */
export function ResetRentFigures({ resetAt, onReset, onNotice }: { /** The last reset, ISO; null if never reset. */ resetAt?: string | null; onReset: () => Promise<void>; onNotice: (message: string) => void }) {
  const [isAsking, setIsAsking] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const last = resetAt ? new Date(resetAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null

  async function reset() {
    setIsBusy(true)
    try {
      const response = await fetch('/api/settings/rent-counters/reset', { method: 'POST' })
      if (!response.ok) { onNotice(await readApiError(response, 'The rent figures could not be reset.')); return }
      await onReset()
      onNotice('Rent figures reset. They count again from now.')
    } catch {
      onNotice('Could not reach the server.')
    } finally {
      setIsBusy(false)
      setIsAsking(false)
    }
  }

  return (
    <>
      <button type="button" className="secondary-button" disabled={isBusy} title={last ? `Last reset ${last}` : 'Count rent collected again from now'} onClick={() => setIsAsking(true)}>
        <RotateCcw size={16} /> Reset rent figures
      </button>
      {isAsking && <ConfirmDialog
        icon={<RotateCcw size={22} />}
        title="Reset the rent figures?"
        detail={`Rent collected today, this month and overall will count again from now.${last ? ` Last reset: ${last}.` : ''} No payment is deleted: they all stay under Payments.`}
        confirmLabel={isBusy ? 'Resetting…' : 'Reset'}
        isBusy={isBusy}
        onConfirm={() => void reset()}
        onCancel={() => setIsAsking(false)}
      />}
    </>
  )
}
