import { useEffect, useState } from 'react'
import { Camera, Wrench, X } from 'lucide-react'
import { resizePropertyPhoto } from './imageResize'
import { formatWhen, maintenanceCategoryLabels, maintenanceStatusLabels, maintenanceStatusTones, type MaintenanceCategory, type MaintenanceRequest } from './maintenance'
import { readApiError } from './superAdmin'
import { ModalLayer } from './ModalLayer'

/** The resident's form: what's wrong, what kind, details and an optional photo (resized before upload). */
function ReportForm({ onCreated, onClose }: { onCreated: (request: MaintenanceRequest) => void; onClose: () => void }) {
  const [photo, setPhoto] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await resizePropertyPhoto(file)
    if ('error' in result) setError(result.error); else { setPhoto(result.dataUrl); setError('') }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIsSaving(true)
    setError('')
    try {
      const response = await fetch('/api/resident-portal/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.get('title'), category: form.get('category'), details: form.get('details'), photo: photo || undefined }) })
      if (!response.ok) { setError(await readApiError(response, 'Could not send your request.')); return }
      onCreated(await response.json() as MaintenanceRequest)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalLayer><div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="report-problem-title" onSubmit={submit}>
        <div className="modal-heading"><div><p className="eyebrow">Complaints &amp; repairs</p><h2 id="report-problem-title">Report a problem</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <label>What's wrong?<input name="title" required maxLength={80} placeholder="e.g. Fan not working" /></label>
        <label>Type<select name="category" required defaultValue="">{[<option key="" value="" disabled>Choose one</option>, ...(Object.entries(maintenanceCategoryLabels) as Array<[MaintenanceCategory, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)]}</select></label>
        <label>Details <span>(optional)</span><textarea name="details" rows={3} maxLength={1000} placeholder="Where exactly, since when…" /></label>
        <div className="maintenance-photo-field">
          {photo ? <img src={photo} alt="Attached" /> : <span className="maintenance-photo-empty"><Camera size={18} /></span>}
          <label className="secondary-button maintenance-photo-button">{photo ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" hidden onChange={(event) => void choosePhoto(event)} /></label>
          {photo && <button type="button" className="text-link" onClick={() => setPhoto('')}>Remove</button>}
        </div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={isSaving}><Wrench size={15} /> {isSaving ? 'Sending…' : 'Send request'}</button></div>
      </form>
    </div></ModalLayer>
  )
}

/**
 * "Complaints & repairs" in the resident portal: report a problem (with an optional photo) and follow
 * each request from Open to In progress to Resolved, with the owner's reply. Refreshes with the portal.
 */
export function ResidentMaintenance({ refreshSignal, onNotice }: { refreshSignal: number; onNotice: (message: string) => void }) {
  const [requests, setRequests] = useState<MaintenanceRequest[] | null>(null)
  const [isReporting, setIsReporting] = useState(false)
  useEffect(() => {
    let isCurrent = true
    fetch('/api/resident-portal/maintenance').then((response) => (response.ok ? response.json() as Promise<MaintenanceRequest[]> : [])).then((rows) => { if (isCurrent) setRequests(rows) }, () => { if (isCurrent) setRequests([]) })
    return () => { isCurrent = false }
  }, [refreshSignal])

  return (
    <section className="workspace-view portal-tab-services">
      <div className="workspace-view-heading"><div><p className="eyebrow">Service</p><h2>Complaints &amp; repairs</h2><p>Something broken or not working? Tell your property owner and track it here.</p></div><button type="button" className="primary-button" onClick={() => setIsReporting(true)}><Wrench size={15} /> Report a problem</button></div>
      {requests === null ? <p className="portal-empty">Loading…</p> : requests.length ? (
        <div className="crud-list">
          {requests.map((request) => (
            <div className="crud-row maintenance-row" key={request.id}>
              <div className="crud-main">
                <strong>{request.title} <span className="maintenance-category">{maintenanceCategoryLabels[request.category] ?? request.category}</span></strong>
                <small>Reported {formatWhen(request.createdAt)}{request.hasPhoto ? ' · ' : ''}{request.hasPhoto && <a href={`/api/resident-portal/maintenance/${request.id}/photo`} target="_blank" rel="noreferrer">photo</a>}</small>
                {request.details && <small>{request.details}</small>}
                {request.ownerNote && <small className="maintenance-note">From your property owner: {request.ownerNote}</small>}
              </div>
              <span className={`status-pill ${maintenanceStatusTones[request.status]}`}>{maintenanceStatusLabels[request.status]}</span>
            </div>
          ))}
        </div>
      ) : <div className="workspace-empty"><div className="workspace-empty-icon"><Wrench size={20} /></div><h3>No requests</h3><p>Tap "Report a problem" if anything needs fixing.</p></div>}
      {isReporting && <ReportForm onClose={() => setIsReporting(false)} onCreated={(created) => { setRequests((current) => [created, ...(current ?? [])]); setIsReporting(false); onNotice('Request sent. Your property owner has been told.') }} />}
    </section>
  )
}
